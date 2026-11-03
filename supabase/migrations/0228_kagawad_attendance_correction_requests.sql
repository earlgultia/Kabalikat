-- Allow a Kagawad to request a correction to their own closed-meeting
-- attendance record, with authorized officials reviewing the change.
create table public.meeting_attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null,
  barangay_id uuid not null,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  previous_status text check (previous_status in ('present', 'absent', 'excused')),
  requested_status text not null check (requested_status in ('present', 'absent', 'excused')),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  foreign key (meeting_id, barangay_id) references public.meetings(id, barangay_id) on delete restrict,
  check ((status = 'pending' and reviewed_by is null and reviewed_at is null)
      or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null))
);

create unique index meeting_attendance_correction_pending_unique_idx
  on public.meeting_attendance_correction_requests(meeting_id, requester_id)
  where status = 'pending';
create index meeting_attendance_correction_requester_history_idx
  on public.meeting_attendance_correction_requests(barangay_id, requester_id, created_at desc, id desc);
create index meeting_attendance_correction_review_queue_idx
  on public.meeting_attendance_correction_requests(barangay_id, created_at, id)
  where status = 'pending';

alter table public.meeting_attendance_correction_requests enable row level security;
revoke all on public.meeting_attendance_correction_requests from public, anon, authenticated;

create or replace function public.request_kagawad_attendance_correction(
  p_meeting_id uuid,
  p_requested_status text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meeting public.meetings%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_request_id uuid;
  v_current_status text;
begin
  select meeting.* into v_meeting
  from public.meetings meeting
  join public.meeting_attendees attendee
    on attendee.meeting_id = meeting.id and attendee.barangay_id = meeting.barangay_id
  join public.barangay_memberships membership
    on membership.barangay_id = meeting.barangay_id
   and membership.user_id = (select auth.uid())
   and membership.status = 'active'
  join public.role_definitions role on role.id = membership.role_id
  where meeting.id = p_meeting_id
    and attendee.user_id = (select auth.uid())
    and role.key = 'kagawad'
    and (meeting.status in ('completed', 'cancelled')
      or coalesce(meeting.ends_at, meeting.starts_at + interval '4 hours') < now());

  if not found then raise exception 'meeting is not eligible for an attendance correction request'; end if;
  if p_requested_status not in ('present', 'absent', 'excused') then raise exception 'invalid attendance status'; end if;
  if length(v_reason) not between 3 and 1000 then raise exception 'reason must be between 3 and 1000 characters'; end if;

  select attendance.status into v_current_status
  from public.attendance_records attendance
  where attendance.meeting_id = p_meeting_id
    and attendance.barangay_id = v_meeting.barangay_id
    and attendance.user_id = (select auth.uid());
  if v_current_status = p_requested_status then raise exception 'attendance already has the requested status'; end if;

  begin
    insert into public.meeting_attendance_correction_requests(
      meeting_id, barangay_id, requester_id, previous_status, requested_status, reason
    ) values (p_meeting_id, v_meeting.barangay_id, (select auth.uid()), v_current_status, p_requested_status, v_reason)
    returning id into v_request_id;
  exception when unique_violation then
    raise exception 'an attendance correction is already awaiting review';
  end;
  return v_request_id;
end;
$$;

create or replace function public.list_kagawad_attendance_correction_requests(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10
)
returns table (
  id uuid,
  meeting_id uuid,
  meeting_title text,
  meeting_starts_at timestamptz,
  requested_status text,
  current_status text,
  reason text,
  status text,
  review_note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
begin
  if not public.is_active_member(p_barangay_id)
    or not exists (
      select 1 from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active' and role.key = 'kagawad'
    ) then raise exception 'not authorized'; end if;

  return query
  with requests as (
    select request.id, request.meeting_id, meeting.title as meeting_title,
      meeting.starts_at as meeting_starts_at, request.requested_status,
      request.previous_status as current_status, request.reason, request.status,
      request.review_note, request.created_at, request.reviewed_at
    from public.meeting_attendance_correction_requests request
    join public.meetings meeting
      on meeting.id = request.meeting_id and meeting.barangay_id = request.barangay_id
    where request.barangay_id = p_barangay_id
      and request.requester_id = (select auth.uid())
  ), counted as (
    select requests.*, count(*) over () as total_count from requests
  )
  select counted.id, counted.meeting_id, counted.meeting_title, counted.meeting_starts_at,
    counted.requested_status, counted.current_status, counted.reason, counted.status,
    counted.review_note, counted.created_at, counted.reviewed_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;

create or replace function public.list_meeting_attendance_correction_queue(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10
)
returns table (
  id uuid,
  meeting_id uuid,
  meeting_title text,
  meeting_starts_at timestamptz,
  requester_name text,
  requested_status text,
  current_status text,
  reason text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
begin
  if not public.has_tenant_permission(p_barangay_id, 'attendance.manage') then
    raise exception 'not authorized';
  end if;

  return query
  with requests as (
    select request.id, request.meeting_id, meeting.title as meeting_title,
      meeting.starts_at as meeting_starts_at,
      coalesce(nullif(profile.display_name, ''), 'Kagawad')::text as requester_name,
      request.requested_status, attendance.status::text as current_status,
      request.reason, request.created_at
    from public.meeting_attendance_correction_requests request
    join public.meetings meeting
      on meeting.id = request.meeting_id and meeting.barangay_id = request.barangay_id
    left join public.profiles profile on profile.id = request.requester_id
    left join public.attendance_records attendance
      on attendance.meeting_id = request.meeting_id
     and attendance.barangay_id = request.barangay_id
     and attendance.user_id = request.requester_id
    where request.barangay_id = p_barangay_id and request.status = 'pending'
  ), counted as (
    select requests.*, count(*) over () as total_count from requests
  )
  select counted.id, counted.meeting_id, counted.meeting_title, counted.meeting_starts_at,
    counted.requester_name, counted.requested_status, counted.current_status,
    counted.reason, counted.created_at, counted.total_count
  from counted
  order by counted.created_at, counted.id
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;

create or replace function public.decide_meeting_attendance_correction(
  p_request_id uuid,
  p_decision text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.meeting_attendance_correction_requests%rowtype;
  v_previous_status text;
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
begin
  select request.* into v_request
  from public.meeting_attendance_correction_requests request
  where request.id = p_request_id
  for update;
  if not found then raise exception 'correction request not found'; end if;
  if not public.has_tenant_permission(v_request.barangay_id, 'attendance.manage') then
    raise exception 'not authorized';
  end if;
  if v_request.status <> 'pending' then raise exception 'correction request is already reviewed'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid decision'; end if;
  if p_decision = 'rejected' and length(coalesce(v_note, '')) not between 3 and 1000 then
    raise exception 'a review note between 3 and 1000 characters is required to decline';
  end if;

  if p_decision = 'approved' then
    select attendance.status into v_previous_status
    from public.attendance_records attendance
    where attendance.meeting_id = v_request.meeting_id
      and attendance.barangay_id = v_request.barangay_id
      and attendance.user_id = v_request.requester_id
    for update;

    insert into public.attendance_records(
      meeting_id, barangay_id, user_id, status, source, recorded_by, reason
    ) values (
      v_request.meeting_id, v_request.barangay_id, v_request.requester_id,
      v_request.requested_status, 'official', (select auth.uid()),
      'Kagawad correction request: ' || v_request.reason
    )
    on conflict (meeting_id, user_id) do update set
      status = excluded.status, source = 'official', recorded_by = excluded.recorded_by,
      reason = excluded.reason, updated_at = now();

    insert into public.attendance_events(
      meeting_id, barangay_id, user_id, actor_id, from_status, to_status, reason
    ) values (
      v_request.meeting_id, v_request.barangay_id, v_request.requester_id,
      (select auth.uid()), v_previous_status, v_request.requested_status,
      'Approved Kagawad correction request: ' || v_request.reason
    );
  end if;

  update public.meeting_attendance_correction_requests request
  set status = p_decision, reviewed_by = (select auth.uid()), review_note = v_note, reviewed_at = now()
  where request.id = v_request.id;
end;
$$;

revoke all on function public.request_kagawad_attendance_correction(uuid, text, text) from public, anon;
revoke all on function public.list_kagawad_attendance_correction_requests(uuid, integer, integer) from public, anon;
revoke all on function public.list_meeting_attendance_correction_queue(uuid, integer, integer) from public, anon;
revoke all on function public.decide_meeting_attendance_correction(uuid, text, text) from public, anon;
grant execute on function public.request_kagawad_attendance_correction(uuid, text, text) to authenticated;
grant execute on function public.list_kagawad_attendance_correction_requests(uuid, integer, integer) to authenticated;
grant execute on function public.list_meeting_attendance_correction_queue(uuid, integer, integer) to authenticated;
grant execute on function public.decide_meeting_attendance_correction(uuid, text, text) to authenticated;
