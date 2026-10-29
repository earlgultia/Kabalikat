-- Phase 5: structured, barangay-scoped disaster and evacuation advisories.
insert into public.permissions(key,description) values
  ('disaster.read','Read published barangay disaster advisories'),
  ('disaster.manage','Create, publish, and resolve barangay disaster advisories')
on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where (r.key in ('captain','secretary') and p.key = 'disaster.manage')
   or (r.key in ('captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident') and p.key = 'disaster.read')
on conflict do nothing;

create table public.disaster_advisories (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  advisory_type text not null check (advisory_type in ('weather','flood','fire','earthquake','landslide','health','other')),
  severity text not null check (severity in ('information','watch','warning','emergency')),
  title text not null,
  affected_area text not null,
  instructions text not null,
  status text not null default 'draft' check (status in ('draft','published','resolved')),
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,barangay_id),
  check (length(trim(title)) between 3 and 180),
  check (length(trim(affected_area)) between 2 and 240),
  check (length(trim(instructions)) between 3 and 4000),
  check (expires_at is null or expires_at > created_at),
  check ((status = 'draft') = (published_at is null)),
  check ((status = 'draft') = (published_by is null)),
  check ((status = 'resolved') = (resolved_at is not null)),
  check ((status = 'resolved') = (resolved_by is not null)),
  check ((status = 'resolved') = (resolution_note is not null)),
  check (resolution_note is null or length(resolution_note) between 3 and 1000)
);
create index disaster_advisories_tenant_status_idx on public.disaster_advisories(barangay_id,status,created_at desc);

create table public.disaster_advisory_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  advisory_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('created','published','resolved')),
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (advisory_id,barangay_id) references public.disaster_advisories(id,barangay_id) on delete restrict,
  check (length(note) <= 1000)
);
create index disaster_advisory_events_advisory_idx on public.disaster_advisory_events(barangay_id,advisory_id,created_at);

create or replace function public.create_disaster_advisory(
  p_barangay_id uuid,p_type text,p_severity text,p_title text,p_affected_area text,p_instructions text,p_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id,'disaster.manage') then raise exception 'not authorized'; end if;
  if p_type not in ('weather','flood','fire','earthquake','landslide','health','other')
    or p_severity not in ('information','watch','warning','emergency')
    or length(trim(coalesce(p_title,''))) not between 3 and 180
    or length(trim(coalesce(p_affected_area,''))) not between 2 and 240
    or length(trim(coalesce(p_instructions,''))) not between 3 and 4000
    or p_expires_at is not null and p_expires_at <= now() then raise exception 'invalid disaster advisory'; end if;
  insert into public.disaster_advisories(barangay_id,advisory_type,severity,title,affected_area,instructions,expires_at,created_by)
    values (p_barangay_id,p_type,p_severity,trim(p_title),trim(p_affected_area),trim(p_instructions),p_expires_at,auth.uid()) returning id into v_id;
  insert into public.disaster_advisory_events(barangay_id,advisory_id,actor_id,action,note)
    values (p_barangay_id,v_id,auth.uid(),'created',trim(p_title));
  return v_id;
end;
$$;

create or replace function public.publish_disaster_advisory(p_advisory_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_advisory public.disaster_advisories%rowtype;
begin
  select * into v_advisory from public.disaster_advisories where id = p_advisory_id for update;
  if not found or not public.has_tenant_permission(v_advisory.barangay_id,'disaster.manage') then raise exception 'not authorized'; end if;
  if v_advisory.status <> 'draft' or v_advisory.expires_at is not null and v_advisory.expires_at <= now() then raise exception 'advisory cannot be published'; end if;
  update public.disaster_advisories set status = 'published',published_by = auth.uid(),published_at = now(),updated_at = now() where id = v_advisory.id;
  insert into public.disaster_advisory_events(barangay_id,advisory_id,actor_id,action)
    values (v_advisory.barangay_id,v_advisory.id,auth.uid(),'published');
end;
$$;

create or replace function public.resolve_disaster_advisory(p_advisory_id uuid,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_advisory public.disaster_advisories%rowtype;
begin
  select * into v_advisory from public.disaster_advisories where id = p_advisory_id for update;
  if not found or not public.has_tenant_permission(v_advisory.barangay_id,'disaster.manage') then raise exception 'not authorized'; end if;
  if v_advisory.status <> 'published' or length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'a resolution note is required for a published advisory'; end if;
  update public.disaster_advisories set status = 'resolved',resolved_by = auth.uid(),resolved_at = now(),resolution_note = trim(p_note),updated_at = now() where id = v_advisory.id;
  insert into public.disaster_advisory_events(barangay_id,advisory_id,actor_id,action,note)
    values (v_advisory.barangay_id,v_advisory.id,auth.uid(),'resolved',trim(p_note));
end;
$$;

alter table public.disaster_advisories enable row level security;
alter table public.disaster_advisory_events enable row level security;
create policy disaster_advisories_read on public.disaster_advisories for select to authenticated
  using (public.has_tenant_permission(barangay_id,'disaster.manage')
    or (status in ('published','resolved') and public.has_tenant_permission(barangay_id,'disaster.read')));
create policy disaster_advisory_events_read on public.disaster_advisory_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'disaster.manage'));
revoke all on public.disaster_advisories,public.disaster_advisory_events from anon,authenticated;
grant select on public.disaster_advisories,public.disaster_advisory_events to authenticated;
revoke all on function public.create_disaster_advisory(uuid,text,text,text,text,text,timestamptz) from public,anon;
revoke all on function public.publish_disaster_advisory(uuid) from public,anon;
revoke all on function public.resolve_disaster_advisory(uuid,text) from public,anon;
grant execute on function public.create_disaster_advisory(uuid,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.publish_disaster_advisory(uuid) to authenticated;
grant execute on function public.resolve_disaster_advisory(uuid,text) to authenticated;
