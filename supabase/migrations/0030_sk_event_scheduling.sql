-- Phase 5: SK event schedules; intentionally excludes youth and participant records.
insert into public.permissions(key,description) values
  ('sk.event.manage','Create and complete SK event schedules'),
  ('sk.event.review','Review and publish SK event schedules')
on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where (r.key = 'sk_chairperson' and p.key = 'sk.event.manage')
   or (r.key = 'captain' and p.key = 'sk.event.review')
on conflict do nothing;

create table public.sk_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  title text not null,
  description text not null default '',
  location text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','published','completed','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  completed_at timestamptz,
  unique (id,barangay_id),
  check (length(trim(title)) between 3 and 180),
  check (length(description) <= 2000),
  check (length(trim(location)) between 2 and 240),
  check (ends_at > starts_at),
  check ((status = 'draft') = (reviewed_by is null)),
  check ((status = 'draft') = (reviewed_at is null)),
  check ((status = 'completed') = (completed_at is not null)),
  check (review_note is null or length(review_note) <= 1000)
);
create index sk_events_tenant_schedule_idx on public.sk_events(barangay_id,status,starts_at);

create table public.sk_event_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  event_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('event_created','event_published','event_rejected','event_completed')),
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (event_id,barangay_id) references public.sk_events(id,barangay_id) on delete restrict,
  check (length(note) <= 1000)
);
create index sk_event_events_event_idx on public.sk_event_events(barangay_id,event_id,created_at);

create or replace function public.create_sk_event(p_barangay_id uuid,p_title text,p_description text,p_location text,p_starts_at timestamptz,p_ends_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id,'sk.event.manage') then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 180 or length(coalesce(p_description,'')) > 2000
    or length(trim(coalesce(p_location,''))) not between 2 and 240 or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid SK event details';
  end if;
  insert into public.sk_events(barangay_id,title,description,location,starts_at,ends_at,created_by)
  values (p_barangay_id,trim(p_title),trim(coalesce(p_description,'')),trim(p_location),p_starts_at,p_ends_at,auth.uid()) returning id into v_id;
  insert into public.sk_event_events(barangay_id,event_id,actor_id,action,note)
  values (p_barangay_id,v_id,auth.uid(),'event_created',trim(p_title));
  return v_id;
end;
$$;

create or replace function public.review_sk_event(p_event_id uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.sk_events%rowtype;
begin
  select * into v_event from public.sk_events where id = p_event_id for update;
  if not found or not public.has_tenant_permission(v_event.barangay_id,'sk.event.review') then raise exception 'not authorized'; end if;
  if v_event.status <> 'draft' then raise exception 'event is no longer awaiting review'; end if;
  if p_approve and v_event.created_by = auth.uid() then raise exception 'event creator cannot approve their own event'; end if;
  if not p_approve and length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'a reason is required to reject this event'; end if;
  update public.sk_events set status = case when p_approve then 'published' else 'cancelled' end,
    reviewed_by = auth.uid(),reviewed_at = now(),review_note = case when p_approve then null else trim(p_note) end where id = v_event.id;
  insert into public.sk_event_events(barangay_id,event_id,actor_id,action,note)
  values (v_event.barangay_id,v_event.id,auth.uid(),case when p_approve then 'event_published' else 'event_rejected' end,case when p_approve then '' else trim(p_note) end);
end;
$$;

create or replace function public.complete_sk_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.sk_events%rowtype;
begin
  select * into v_event from public.sk_events where id = p_event_id for update;
  if not found or not public.has_tenant_permission(v_event.barangay_id,'sk.event.manage') then raise exception 'not authorized'; end if;
  if v_event.status <> 'published' or v_event.ends_at > now() then raise exception 'event cannot be completed before its scheduled end'; end if;
  update public.sk_events set status = 'completed',completed_at = now() where id = v_event.id;
  insert into public.sk_event_events(barangay_id,event_id,actor_id,action) values (v_event.barangay_id,v_event.id,auth.uid(),'event_completed');
end;
$$;

alter table public.sk_events enable row level security;
alter table public.sk_event_events enable row level security;
create policy sk_events_read on public.sk_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'sk.event.manage') or public.has_tenant_permission(barangay_id,'sk.event.review')
    or (public.is_active_member(barangay_id) and status in ('published','completed')));
create policy sk_event_events_read on public.sk_event_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'sk.event.manage') or public.has_tenant_permission(barangay_id,'sk.event.review'));
revoke all on public.sk_events,public.sk_event_events from anon,authenticated;
grant select on public.sk_events,public.sk_event_events to authenticated;
revoke all on function public.create_sk_event(uuid,text,text,text,timestamptz,timestamptz) from public,anon;
revoke all on function public.review_sk_event(uuid,boolean,text) from public,anon;
revoke all on function public.complete_sk_event(uuid) from public,anon;
grant execute on function public.create_sk_event(uuid,text,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.review_sk_event(uuid,boolean,text) to authenticated;
grant execute on function public.complete_sk_event(uuid) to authenticated;
