-- Phase 3: reviewed meeting minutes and approved resolutions.
create sequence public.meeting_resolution_number_seq;

create table public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  meeting_id uuid not null unique,
  content text not null default '',
  status text not null default 'draft' check (status in ('draft','reviewed')),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (meeting_id, barangay_id) references public.meetings(id, barangay_id) on delete restrict,
  check (length(content) <= 100000),
  check (status <> 'reviewed' or length(trim(content)) >= 3)
);

create table public.meeting_resolutions (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  meeting_id uuid not null,
  resolution_number text not null,
  title text not null,
  content text not null,
  status text not null default 'draft' check (status in ('draft','approved')),
  proposed_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (meeting_id, barangay_id) references public.meetings(id, barangay_id) on delete restrict,
  unique (barangay_id, resolution_number),
  check (length(trim(title)) between 3 and 180),
  check (length(trim(content)) between 3 and 20000),
  check ((status = 'approved') = (approved_at is not null)),
  check ((status = 'approved') = (approved_by is not null))
);
create index meeting_resolutions_meeting_idx on public.meeting_resolutions(meeting_id, created_at);

create table public.meeting_record_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  meeting_id uuid not null,
  minutes_id uuid references public.meeting_minutes(id) on delete restrict,
  resolution_id uuid references public.meeting_resolutions(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('minutes_saved','minutes_reviewed','resolution_proposed','resolution_approved')),
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now(),
  foreign key (meeting_id, barangay_id) references public.meetings(id, barangay_id) on delete restrict,
  check ((minutes_id is not null) <> (resolution_id is not null))
);
create index meeting_record_events_meeting_idx on public.meeting_record_events(barangay_id, meeting_id, created_at);

create or replace function public.save_meeting_minutes(p_meeting_id uuid, p_content text, p_reviewed boolean default false)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_meeting public.meetings%rowtype; v_minutes public.meeting_minutes%rowtype; v_status text; v_action text; v_from_status text;
begin
  select * into v_meeting from public.meetings where id = p_meeting_id for update;
  if not found or not public.has_tenant_permission(v_meeting.barangay_id, 'meeting.manage') then raise exception 'not authorized'; end if;
  if length(coalesce(p_content, '')) > 100000 or (p_reviewed and length(trim(coalesce(p_content, ''))) < 3) then
    raise exception 'invalid meeting minutes';
  end if;
  select * into v_minutes from public.meeting_minutes where meeting_id = p_meeting_id for update;
  v_from_status := case when found then v_minutes.status else null end;
  v_status := case when p_reviewed then 'reviewed' else 'draft' end;
  v_action := case when p_reviewed then 'minutes_reviewed' else 'minutes_saved' end;
  insert into public.meeting_minutes(barangay_id, meeting_id, content, status, updated_by)
  values (v_meeting.barangay_id, p_meeting_id, coalesce(p_content, ''), v_status, auth.uid())
  on conflict (meeting_id) do update set content = excluded.content, status = excluded.status,
    updated_by = excluded.updated_by, updated_at = now()
  returning id into v_minutes.id;
  insert into public.meeting_record_events(barangay_id, meeting_id, minutes_id, actor_id, action, from_status, to_status)
  values (v_meeting.barangay_id, p_meeting_id, v_minutes.id, auth.uid(), v_action,
    v_from_status, v_status);
  return v_minutes.id;
end;
$$;

create or replace function public.create_meeting_resolution(p_meeting_id uuid, p_title text, p_content text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_meeting public.meetings%rowtype; v_resolution_id uuid; v_number text;
begin
  select * into v_meeting from public.meetings where id = p_meeting_id for update;
  if not found or not public.has_tenant_permission(v_meeting.barangay_id, 'meeting.manage') then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_title, ''))) not between 3 and 180
    or length(trim(coalesce(p_content, ''))) not between 3 and 20000 then raise exception 'invalid resolution'; end if;
  v_number := 'RES-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.meeting_resolution_number_seq')::text, 6, '0');
  insert into public.meeting_resolutions(barangay_id, meeting_id, resolution_number, title, content, proposed_by)
  values (v_meeting.barangay_id, p_meeting_id, v_number, trim(p_title), trim(p_content), auth.uid())
  returning id into v_resolution_id;
  insert into public.meeting_record_events(barangay_id, meeting_id, resolution_id, actor_id, action, to_status)
  values (v_meeting.barangay_id, p_meeting_id, v_resolution_id, auth.uid(), 'resolution_proposed', 'draft');
  return v_resolution_id;
end;
$$;

create or replace function public.approve_meeting_resolution(p_resolution_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_resolution public.meeting_resolutions%rowtype;
begin
  select * into v_resolution from public.meeting_resolutions where id = p_resolution_id for update;
  if not found or not public.has_tenant_permission(v_resolution.barangay_id, 'meeting.manage') then raise exception 'not authorized'; end if;
  if v_resolution.status <> 'draft' then raise exception 'resolution is not awaiting approval'; end if;
  update public.meeting_resolutions set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
    where id = v_resolution.id;
  insert into public.meeting_record_events(barangay_id, meeting_id, resolution_id, actor_id, action, from_status, to_status)
  values (v_resolution.barangay_id, v_resolution.meeting_id, v_resolution.id, auth.uid(), 'resolution_approved', 'draft', 'approved');
end;
$$;

alter table public.meeting_minutes enable row level security;
alter table public.meeting_resolutions enable row level security;
alter table public.meeting_record_events enable row level security;
create policy meeting_minutes_read on public.meeting_minutes for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'meeting.read') or public.is_meeting_attendee(meeting_id));
create policy meeting_resolutions_read on public.meeting_resolutions for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'meeting.read') or public.is_meeting_attendee(meeting_id));
create policy meeting_record_events_read on public.meeting_record_events for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'meeting.manage'));

revoke all on public.meeting_minutes, public.meeting_resolutions, public.meeting_record_events from anon, authenticated;
grant select on public.meeting_minutes, public.meeting_resolutions, public.meeting_record_events to authenticated;
revoke all on sequence public.meeting_resolution_number_seq from public, anon, authenticated;
revoke all on function public.save_meeting_minutes(uuid,text,boolean) from public, anon;
revoke all on function public.create_meeting_resolution(uuid,text,text) from public, anon;
revoke all on function public.approve_meeting_resolution(uuid) from public, anon;
grant execute on function public.save_meeting_minutes(uuid,text,boolean) to authenticated;
grant execute on function public.create_meeting_resolution(uuid,text,text) to authenticated;
grant execute on function public.approve_meeting_resolution(uuid) to authenticated;
