-- Phase 5: tenant-scoped Tanod incident reporting and Captain follow-up.
insert into public.permissions(key,description) values
  ('incident.create','Submit safety and hazard reports'),
  ('incident.manage','Review and update barangay incident reports')
on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where (r.key = 'tanod' and p.key = 'incident.create')
   or (r.key = 'captain' and p.key = 'incident.manage')
on conflict do nothing;

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  category text not null check (category in ('safety','hazard','disturbance','property','disaster','other')),
  severity text not null check (severity in ('low','moderate','high','urgent')),
  location text not null,
  summary text not null,
  details text not null default '',
  status text not null default 'submitted' check (status in ('submitted','acknowledged','in_progress','resolved','closed')),
  resolution_note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  managed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,barangay_id),
  check (length(trim(location)) between 2 and 240),
  check (length(trim(summary)) between 3 and 180),
  check (length(details) <= 3000),
  check (resolution_note is null or length(resolution_note) <= 1000),
  check ((status in ('resolved','closed')) = (resolution_note is not null))
);
create index incidents_tenant_status_idx on public.incidents(barangay_id,status,created_at desc);

create table public.incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null,
  barangay_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('submitted','acknowledged','started','resolved','closed')),
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (incident_id,barangay_id) references public.incidents(id,barangay_id) on delete restrict,
  check (length(note) <= 1000)
);
create index incident_events_tenant_idx on public.incident_events(barangay_id,incident_id,created_at desc);

create or replace function public.submit_incident(
  p_barangay_id uuid,p_category text,p_severity text,p_location text,p_summary text,p_details text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id,'incident.create') then raise exception 'not authorized'; end if;
  if p_category not in ('safety','hazard','disturbance','property','disaster','other')
    or p_severity not in ('low','moderate','high','urgent')
    or length(trim(coalesce(p_location,''))) not between 2 and 240
    or length(trim(coalesce(p_summary,''))) not between 3 and 180
    or length(coalesce(p_details,'')) > 3000 then raise exception 'invalid incident report'; end if;
  insert into public.incidents(barangay_id,category,severity,location,summary,details,created_by)
  values (p_barangay_id,p_category,p_severity,trim(p_location),trim(p_summary),trim(coalesce(p_details,'')),auth.uid()) returning id into v_id;
  insert into public.incident_events(incident_id,barangay_id,actor_id,action,note)
  values (v_id,p_barangay_id,auth.uid(),'submitted',trim(p_summary));
  return v_id;
end;
$$;

create or replace function public.transition_incident(p_incident_id uuid,p_status text,p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_action text;
begin
  select * into v_incident from public.incidents where id = p_incident_id for update;
  if not found or not public.has_tenant_permission(v_incident.barangay_id,'incident.manage') then raise exception 'not authorized'; end if;
  if not ((v_incident.status = 'submitted' and p_status = 'acknowledged')
    or (v_incident.status = 'acknowledged' and p_status = 'in_progress')
    or (v_incident.status = 'in_progress' and p_status = 'resolved')
    or (v_incident.status = 'resolved' and p_status = 'closed')) then raise exception 'invalid incident status transition'; end if;
  if p_status in ('resolved','closed') and length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'a resolution note is required'; end if;
  v_action := case p_status when 'acknowledged' then 'acknowledged' when 'in_progress' then 'started' when 'resolved' then 'resolved' else 'closed' end;
  update public.incidents set status = p_status, managed_by = auth.uid(),
    resolution_note = case when p_status in ('resolved','closed') then trim(p_note) else null end, updated_at = now()
  where id = v_incident.id;
  insert into public.incident_events(incident_id,barangay_id,actor_id,action,note)
  values (v_incident.id,v_incident.barangay_id,auth.uid(),v_action,trim(coalesce(p_note,'')));
end;
$$;

alter table public.incidents enable row level security;
alter table public.incident_events enable row level security;
create policy incidents_read on public.incidents for select to authenticated
  using (public.has_tenant_permission(barangay_id,'incident.manage')
    or (created_by = (select auth.uid()) and public.has_tenant_permission(barangay_id,'incident.create')));
create policy incident_events_read on public.incident_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'incident.manage')
    or (exists (select 1 from public.incidents i where i.id = incident_id and i.created_by = (select auth.uid()))
      and public.has_tenant_permission(barangay_id,'incident.create')));
revoke all on public.incidents,public.incident_events from anon,authenticated;
grant select on public.incidents,public.incident_events to authenticated;
revoke all on function public.submit_incident(uuid,text,text,text,text,text) from public,anon;
revoke all on function public.transition_incident(uuid,text,text) from public,anon;
grant execute on function public.submit_incident(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.transition_incident(uuid,text,text) to authenticated;
