-- Preserve each meaningful response change so a Kagawad can review their
-- own RSVP history separately from attendance records.
create table public.meeting_invitation_response_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null,
  barangay_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  response text not null check (response in ('attending', 'unavailable')),
  responded_at timestamptz not null default now(),
  foreign key (meeting_id, barangay_id)
    references public.meetings(id, barangay_id) on delete restrict,
  foreign key (meeting_id, user_id)
    references public.meeting_attendees(meeting_id, user_id) on delete restrict
);

create index meeting_invitation_response_events_user_history_idx
  on public.meeting_invitation_response_events(barangay_id, user_id, responded_at desc, id desc);

alter table public.meeting_invitation_response_events enable row level security;
revoke all on public.meeting_invitation_response_events from public, anon, authenticated;

create or replace function public.log_meeting_invitation_response_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.meeting_invitation_response_events(
    meeting_id, barangay_id, user_id, response, responded_at
  ) values (
    new.meeting_id, new.barangay_id, new.user_id, new.response, new.responded_at
  );
  return new;
end;
$$;

revoke all on function public.log_meeting_invitation_response_event() from public, anon, authenticated;

create trigger meeting_invitation_response_insert_event
  after insert on public.meeting_invitation_responses
  for each row execute function public.log_meeting_invitation_response_event();

create trigger meeting_invitation_response_update_event
  after update on public.meeting_invitation_responses
  for each row when (old.response is distinct from new.response)
  execute function public.log_meeting_invitation_response_event();

create or replace function public.list_kagawad_meeting_invitation_response_history(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10
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
  ), counted as (
    select history.*, count(*) over () as total_count from history
  )
  select counted.id, counted.meeting_id, counted.meeting_title,
    counted.meeting_starts_at, counted.response, counted.responded_at, counted.total_count
  from counted
  order by counted.responded_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_kagawad_meeting_invitation_response_history(uuid, integer, integer) from public, anon;
grant execute on function public.list_kagawad_meeting_invitation_response_history(uuid, integer, integer) to authenticated;
