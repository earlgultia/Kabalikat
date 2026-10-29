-- Phase 5: private, incident-scoped evidence files for Captains and assigned Tanods.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('incident-evidence','incident-evidence',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false,file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png'];

create table public.incident_evidence_upload_intents (
  id uuid primary key,
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  incident_id uuid not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  storage_path text not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  foreign key (incident_id,barangay_id) references public.incidents(id,barangay_id) on delete restrict,
  check (length(trim(file_name)) between 1 and 180),
  check (mime_type in ('application/pdf','image/jpeg','image/png')),
  check (file_size between 1 and 10485760)
);

create table public.incident_evidence (
  id uuid primary key,
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  incident_id uuid not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  storage_path text not null unique,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (incident_id,barangay_id) references public.incidents(id,barangay_id) on delete restrict,
  unique (id,barangay_id),
  check (length(trim(file_name)) between 1 and 180),
  check (mime_type in ('application/pdf','image/jpeg','image/png')),
  check (file_size between 1 and 10485760),
  check (storage_path = barangay_id::text || '/' || incident_id::text || '/' || id::text || '/' || file_name)
);
create index incident_evidence_incident_idx on public.incident_evidence(incident_id,created_at desc);

alter table public.incident_events drop constraint incident_events_action_check;
alter table public.incident_events add constraint incident_events_action_check
  check (action in ('submitted','assigned','acknowledged','started','resolved','closed','response_update','evidence_attached'));

create or replace function public.create_incident_evidence_upload_intent(
  p_incident_id uuid,p_evidence_id uuid,p_file_name text,p_mime_type text,p_file_size bigint
) returns text language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_allowed boolean; v_path text;
begin
  select * into v_incident from public.incidents where id = p_incident_id;
  if not found then raise exception 'incident not found'; end if;
  v_allowed := public.has_tenant_permission(v_incident.barangay_id,'incident.manage')
    or (coalesce(v_incident.assigned_to = auth.uid(),false)
      and public.has_tenant_permission(v_incident.barangay_id,'incident.create'));
  if not v_allowed then raise exception 'not authorized'; end if;
  if v_incident.status = 'closed' then raise exception 'evidence cannot be attached to a closed incident'; end if;
  if length(trim(coalesce(p_file_name,''))) not between 1 and 180
    or position('/' in p_file_name) > 0 or position(chr(92) in p_file_name) > 0
    or p_mime_type is null or p_mime_type not in ('application/pdf','image/jpeg','image/png')
    or p_file_size is null or p_file_size not between 1 and 10485760 then raise exception 'invalid evidence file details'; end if;
  v_path := v_incident.barangay_id::text || '/' || v_incident.id::text || '/' || p_evidence_id::text || '/' || trim(p_file_name);
  insert into public.incident_evidence_upload_intents(id,barangay_id,incident_id,file_name,mime_type,file_size,storage_path,created_by,expires_at)
  values (p_evidence_id,v_incident.barangay_id,v_incident.id,trim(p_file_name),p_mime_type,p_file_size,v_path,auth.uid(),now() + interval '20 minutes');
  return v_path;
end;
$$;

create or replace function public.register_incident_evidence(p_evidence_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_intent public.incident_evidence_upload_intents%rowtype; v_incident public.incidents%rowtype; v_allowed boolean; v_mime text; v_size bigint;
begin
  select * into v_intent from public.incident_evidence_upload_intents where id = p_evidence_id and created_by = auth.uid() for update;
  if not found or v_intent.expires_at <= now() then raise exception 'evidence upload authorization expired'; end if;
  select * into v_incident from public.incidents where id = v_intent.incident_id for update;
  if not found or v_incident.status = 'closed' then raise exception 'evidence cannot be attached to this incident'; end if;
  v_allowed := public.has_tenant_permission(v_intent.barangay_id,'incident.manage')
    or (coalesce(v_incident.assigned_to = auth.uid(),false)
      and public.has_tenant_permission(v_intent.barangay_id,'incident.create'));
  if not v_allowed then raise exception 'not authorized'; end if;
  select o.metadata ->> 'mimetype',(o.metadata ->> 'size')::bigint into v_mime,v_size
    from storage.objects o where o.bucket_id = 'incident-evidence' and o.name = v_intent.storage_path;
  if not found or v_mime is distinct from v_intent.mime_type or v_size is distinct from v_intent.file_size then
    raise exception 'uploaded evidence does not match its authorization';
  end if;
  insert into public.incident_evidence(id,barangay_id,incident_id,file_name,mime_type,file_size,storage_path,uploaded_by)
  values (v_intent.id,v_intent.barangay_id,v_intent.incident_id,v_intent.file_name,v_intent.mime_type,v_intent.file_size,v_intent.storage_path,auth.uid());
  insert into public.incident_events(incident_id,barangay_id,actor_id,action,note)
    values (v_intent.incident_id,v_intent.barangay_id,auth.uid(),'evidence_attached',v_intent.file_name);
  delete from public.incident_evidence_upload_intents where id = v_intent.id;
  return v_intent.id;
end;
$$;

alter table public.incident_evidence enable row level security;
alter table public.incident_evidence_upload_intents enable row level security;
create policy incident_evidence_read on public.incident_evidence for select to authenticated
  using (public.has_tenant_permission(barangay_id,'incident.manage') or exists (
    select 1 from public.incidents i where i.id = incident_id and i.barangay_id = incident_evidence.barangay_id
      and i.assigned_to = (select auth.uid()) and public.has_tenant_permission(barangay_id,'incident.create')
  ));
create policy incident_evidence_intent_read_own on public.incident_evidence_upload_intents for select to authenticated
  using (created_by = (select auth.uid()) and (public.has_tenant_permission(barangay_id,'incident.manage') or exists (
    select 1 from public.incidents i where i.id = incident_id and i.barangay_id = incident_evidence_upload_intents.barangay_id
      and i.assigned_to = (select auth.uid()) and public.has_tenant_permission(barangay_id,'incident.create')
  )));

create policy incident_evidence_storage_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'incident-evidence' and exists (
    select 1 from public.incident_evidence_upload_intents i join public.incidents n on n.id = i.incident_id and n.barangay_id = i.barangay_id
    where i.storage_path = name and i.created_by = (select auth.uid()) and i.expires_at > now() and n.status <> 'closed'
      and (public.has_tenant_permission(i.barangay_id,'incident.manage')
        or (n.assigned_to = (select auth.uid()) and public.has_tenant_permission(i.barangay_id,'incident.create')))
  ));
create policy incident_evidence_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'incident-evidence' and exists (
    select 1 from public.incident_evidence e join public.incidents i on i.id = e.incident_id and i.barangay_id = e.barangay_id
    where e.storage_path = name and (public.has_tenant_permission(e.barangay_id,'incident.manage')
      or (i.assigned_to = (select auth.uid()) and public.has_tenant_permission(e.barangay_id,'incident.create')))
  ));

revoke all on public.incident_evidence,public.incident_evidence_upload_intents from anon,authenticated;
grant select on public.incident_evidence,public.incident_evidence_upload_intents to authenticated;
revoke all on function public.create_incident_evidence_upload_intent(uuid,uuid,text,text,bigint) from public,anon;
revoke all on function public.register_incident_evidence(uuid) from public,anon;
grant execute on function public.create_incident_evidence_upload_intent(uuid,uuid,text,text,bigint) to authenticated;
grant execute on function public.register_incident_evidence(uuid) to authenticated;
