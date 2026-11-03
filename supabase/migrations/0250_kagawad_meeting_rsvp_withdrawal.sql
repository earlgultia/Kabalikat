-- Let an invited Kagawad withdraw an RSVP while retaining a distinct history event.
alter table public.meeting_invitation_response_events
  drop constraint if exists meeting_invitation_response_events_response_check;
alter table public.meeting_invitation_response_events
  add constraint meeting_invitation_response_events_response_check
  check (response in ('attending', 'unavailable', 'withdrawn'));

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
  v_removed boolean := false;
begin
  if p_response is null or p_response not in ('attending', 'unavailable', 'withdrawn') then
    raise exception 'invalid meeting response';
  end if;

  select meeting.barangay_id into v_barangay_id
  from public.meetings meeting
  join public.meeting_attendees attendee
    on attendee.meeting_id = meeting.id
   and attendee.barangay_id = meeting.barangay_id
  join public.barangay_memberships membership
    on membership.barangay_id = meeting.barangay_id
   and membership.user_id = (select auth.uid())
   and membership.status = 'active'
  join public.role_definitions role on role.id = membership.role_id
  where meeting.id = p_meeting_id
    and meeting.status = 'scheduled'
    and meeting.starts_at > now()
    and attendee.user_id = (select auth.uid())
    and not exists (
      select 1
      from public.attendance_records attendance
      where attendance.meeting_id = meeting.id
        and attendance.user_id = (select auth.uid())
    )
    and role.key = 'kagawad';

  if v_barangay_id is null then
    raise exception 'only an invited Kagawad can respond before a scheduled meeting';
  end if;

  if p_response = 'withdrawn' then
    delete from public.meeting_invitation_responses response
    where response.meeting_id = p_meeting_id
      and response.barangay_id = v_barangay_id
      and response.user_id = (select auth.uid())
    returning true into v_removed;

    if coalesce(v_removed, false) then
      insert into public.meeting_invitation_response_events(
        meeting_id, barangay_id, user_id, response, responded_at
      ) values (
        p_meeting_id, v_barangay_id, (select auth.uid()), 'withdrawn', now()
      );
    end if;
    return;
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

create or replace function public.search_kagawad_meeting_rsvp_history(
  p_barangay_id uuid,
  p_page integer,
  p_page_size integer,
  p_search text,
  p_response text,
  p_meeting_date_after date,
  p_meeting_date_before date
)
returns table (
  id uuid,
  meeting_id uuid,
  meeting_title text,
  meeting_starts_at timestamptz,
  response text,
  responded_at timestamptz,
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
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_response text := coalesce(nullif(p_response, ''), 'all');
begin
  if v_response not in ('all', 'attending', 'unavailable', 'withdrawn') then
    raise exception 'invalid RSVP response filter';
  end if;
  if p_meeting_date_after is not null and p_meeting_date_before is not null
    and p_meeting_date_after > p_meeting_date_before then
    raise exception 'meeting start date must be on or before meeting end date';
  end if;

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
  with history as (
    select event.id, event.meeting_id, meeting.title as meeting_title,
      meeting.starts_at as meeting_starts_at, event.response, event.responded_at
    from public.meeting_invitation_response_events event
    join public.meetings meeting
      on meeting.id = event.meeting_id and meeting.barangay_id = event.barangay_id
    join public.meeting_attendees attendee
      on attendee.meeting_id = event.meeting_id
     and attendee.barangay_id = event.barangay_id
     and attendee.user_id = event.user_id
    where event.barangay_id = p_barangay_id
      and event.user_id = (select auth.uid())
      and (v_response = 'all' or event.response = v_response)
      and (p_meeting_date_after is null or (meeting.starts_at at time zone 'Asia/Manila')::date >= p_meeting_date_after)
      and (p_meeting_date_before is null or (meeting.starts_at at time zone 'Asia/Manila')::date <= p_meeting_date_before)
      and (v_search is null or position(lower(v_search) in lower(meeting.title)) > 0)
  ), counted as (
    select history.*, count(*) over () as total_count from history
  )
  select counted.id, counted.meeting_id, counted.meeting_title,
    counted.meeting_starts_at, counted.response, counted.responded_at,
    counted.total_count
  from counted
  order by counted.responded_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.search_kagawad_meeting_rsvp_history(uuid, integer, integer, text, text, date, date) from public, anon;
grant execute on function public.search_kagawad_meeting_rsvp_history(uuid, integer, integer, text, text, date, date) to authenticated;
