-- Let invited Kagawads share their plans for upcoming meetings without
-- changing or creating an attendance record.
create table public.meeting_invitation_responses (
  meeting_id uuid not null,
  barangay_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  response text not null check (response in ('attending', 'unavailable')),
  responded_at timestamptz not null default now(),
  primary key (meeting_id, user_id),
  foreign key (meeting_id, barangay_id)
    references public.meetings(id, barangay_id) on delete restrict,
  foreign key (meeting_id, user_id)
    references public.meeting_attendees(meeting_id, user_id) on delete restrict
);

create index meeting_invitation_responses_summary_idx
  on public.meeting_invitation_responses(barangay_id, meeting_id, response);

alter table public.meeting_invitation_responses enable row level security;
revoke all on public.meeting_invitation_responses from public, anon, authenticated;

create or replace function public.set_kagawad_meeting_invitation_response(
  p_meeting_id uuid,
  p_response text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
begin
  if p_response not in ('attending', 'unavailable') then
    raise exception 'invalid meeting response';
  end if;

  select meeting.barangay_id into v_barangay_id
  from public.meetings meeting
  join public.meeting_attendees attendee
    on attendee.meeting_id = meeting.id and attendee.barangay_id = meeting.barangay_id
  join public.barangay_memberships membership
    on membership.barangay_id = meeting.barangay_id
   and membership.user_id = (select auth.uid())
   and membership.status = 'active'
  join public.role_definitions role on role.id = membership.role_id
  where meeting.id = p_meeting_id
    and meeting.status = 'scheduled'
    and meeting.starts_at > now()
    and attendee.user_id = (select auth.uid())
    and role.key = 'kagawad';

  if v_barangay_id is null then
    raise exception 'only an invited Kagawad can respond before a scheduled meeting';
  end if;

  insert into public.meeting_invitation_responses(meeting_id, barangay_id, user_id, response, responded_at)
  values (p_meeting_id, v_barangay_id, (select auth.uid()), p_response, now())
  on conflict (meeting_id, user_id) do update
    set response = excluded.response, responded_at = excluded.responded_at
    where public.meeting_invitation_responses.response is distinct from excluded.response;
end;
$$;

revoke all on function public.set_kagawad_meeting_invitation_response(uuid, text) from public, anon;
grant execute on function public.set_kagawad_meeting_invitation_response(uuid, text) to authenticated;

-- Extend the existing invitation queue with the caller's RSVP state.
drop function public.list_kagawad_invited_meetings(uuid, integer, integer);
create function public.list_kagawad_invited_meetings(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10
)
returns table (
  id uuid,
  title text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  attendance_status text,
  check_in_open boolean,
  invitation_response text,
  response_updated_at timestamptz,
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
      select 1
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    ) then
    raise exception 'not authorized';
  end if;

  return query
  with invited as (
    select meeting.id, meeting.title, meeting.location, meeting.starts_at, meeting.ends_at,
      attendance.status as attendance_status,
      (
        attendance.user_id is null
        and now() >= meeting.starts_at - interval '30 minutes'
        and now() <= coalesce(meeting.ends_at, meeting.starts_at + interval '4 hours') + interval '30 minutes'
      ) as check_in_open,
      response.response as invitation_response,
      response.responded_at as response_updated_at
    from public.meeting_attendees attendee
    join public.meetings meeting
      on meeting.id = attendee.meeting_id
     and meeting.barangay_id = attendee.barangay_id
    join public.barangay_memberships membership
      on membership.user_id = attendee.user_id
     and membership.barangay_id = attendee.barangay_id
     and membership.status = 'active'
    left join public.attendance_records attendance
      on attendance.meeting_id = meeting.id
     and attendance.user_id = (select auth.uid())
    left join public.meeting_invitation_responses response
      on response.meeting_id = meeting.id
     and response.barangay_id = meeting.barangay_id
     and response.user_id = (select auth.uid())
    where attendee.barangay_id = p_barangay_id
      and attendee.user_id = (select auth.uid())
      and meeting.status = 'scheduled'
      and coalesce(meeting.ends_at, meeting.starts_at + interval '4 hours') + interval '30 minutes' >= now()
  ), counted as (
    select invited.*, count(*) over () as total_count
    from invited
  )
  select counted.id, counted.title, counted.location, counted.starts_at, counted.ends_at,
    counted.attendance_status, counted.check_in_open, counted.invitation_response,
    counted.response_updated_at, counted.total_count
  from counted
  order by counted.starts_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_kagawad_invited_meetings(uuid, integer, integer) from public, anon;
grant execute on function public.list_kagawad_invited_meetings(uuid, integer, integer) to authenticated;

create or replace function public.get_meeting_invitation_response_summary(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
  v_invited_count bigint;
  v_attending_count bigint;
  v_unavailable_count bigint;
  v_no_response_count bigint;
begin
  select meeting.barangay_id into v_barangay_id
  from public.meetings meeting
  where meeting.id = p_meeting_id;

  if v_barangay_id is null
    or not (public.has_tenant_permission(v_barangay_id, 'meeting.manage')
      or public.has_tenant_permission(v_barangay_id, 'attendance.manage')) then
    raise exception 'not authorized';
  end if;

  select count(*)::bigint,
    count(*) filter (where response.response = 'attending')::bigint,
    count(*) filter (where response.response = 'unavailable')::bigint,
    count(*) filter (where response.response is null)::bigint
  into v_invited_count, v_attending_count, v_unavailable_count, v_no_response_count
  from public.meeting_attendees attendee
  join public.barangay_memberships membership
    on membership.user_id = attendee.user_id
   and membership.barangay_id = attendee.barangay_id
   and membership.status = 'active'
  left join public.meeting_invitation_responses response
    on response.meeting_id = attendee.meeting_id
   and response.barangay_id = attendee.barangay_id
   and response.user_id = attendee.user_id
  where attendee.meeting_id = p_meeting_id
    and attendee.barangay_id = v_barangay_id;

  return jsonb_build_object(
    'invited_count', v_invited_count,
    'attending_count', v_attending_count,
    'unavailable_count', v_unavailable_count,
    'no_response_count', v_no_response_count
  );
end;
$$;

revoke all on function public.get_meeting_invitation_response_summary(uuid) from public, anon;
grant execute on function public.get_meeting_invitation_response_summary(uuid) to authenticated;
