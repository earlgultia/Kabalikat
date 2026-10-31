-- Preserve the schedule values associated with each attendee notification.
alter table public.meeting_update_events
  add column if not exists snapshot_title text,
  add column if not exists snapshot_location text,
  add column if not exists snapshot_starts_at timestamptz,
  add column if not exists snapshot_ends_at timestamptz;

create or replace function public.notify_meeting_schedule_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fields text[];
  v_event_id uuid;
begin
  v_fields := array_remove(array[
    case when old.title is distinct from new.title then 'title' end,
    case when old.location is distinct from new.location then 'location' end,
    case when old.starts_at is distinct from new.starts_at then 'starts_at' end,
    case when old.ends_at is distinct from new.ends_at then 'ends_at' end,
    case when old.agenda is distinct from new.agenda then 'agenda' end
  ], null);
  if cardinality(v_fields) = 0 then return new; end if;

  insert into public.meeting_update_events(
    meeting_id, barangay_id, changed_by, changed_fields,
    snapshot_title, snapshot_location, snapshot_starts_at, snapshot_ends_at
  ) values (
    new.id, new.barangay_id, auth.uid(), v_fields,
    new.title, new.location, new.starts_at, new.ends_at
  ) returning id into v_event_id;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select new.barangay_id, a.user_id, 'meeting_update', v_event_id
  from public.meeting_attendees a
  join public.barangay_memberships m
    on m.user_id = a.user_id and m.barangay_id = new.barangay_id and m.status = 'active'
  where a.meeting_id = new.id and a.barangay_id = new.barangay_id
    and a.user_id is distinct from auth.uid()
    and not exists (
      select 1 from public.community_notification_preferences pref
      where pref.user_id = a.user_id and pref.barangay_id = new.barangay_id
        and pref.resource_type = 'meeting_update' and pref.enabled = false
    )
  on conflict (recipient_id, resource_type, resource_id) do nothing;
  return new;
end;
$$;
revoke all on function public.notify_meeting_schedule_update() from public, anon, authenticated;

create or replace function public.notify_meeting_status_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
begin
  insert into public.meeting_update_events(
    meeting_id, barangay_id, changed_by, changed_fields, reason,
    snapshot_title, snapshot_location, snapshot_starts_at, snapshot_ends_at
  )
  select new.meeting_id, new.barangay_id, new.actor_id,
    array['status', new.to_status::text], nullif(trim(new.reason), ''),
    m.title, m.location, m.starts_at, m.ends_at
  from public.meetings m
  where m.id = new.meeting_id and m.barangay_id = new.barangay_id
  returning id into v_event_id;

  if v_event_id is null then return new; end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select new.barangay_id, a.user_id, 'meeting_update', v_event_id
  from public.meeting_attendees a
  join public.barangay_memberships m
    on m.user_id = a.user_id and m.barangay_id = new.barangay_id and m.status = 'active'
  where a.meeting_id = new.meeting_id and a.barangay_id = new.barangay_id
    and a.user_id is distinct from new.actor_id
    and not exists (
      select 1 from public.community_notification_preferences pref
      where pref.user_id = a.user_id and pref.barangay_id = new.barangay_id
        and pref.resource_type = 'meeting_update' and pref.enabled = false
    )
  on conflict (recipient_id, resource_type, resource_id) do nothing;
  return new;
end;
$$;
revoke all on function public.notify_meeting_status_event() from public, anon, authenticated;

drop function if exists public.list_my_meeting_update_details(uuid[]);
create function public.list_my_meeting_update_details(p_event_ids uuid[])
returns table (
  event_id uuid,
  meeting_id uuid,
  title text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  page_number integer,
  changed_fields text[],
  reason text
)
language sql stable security invoker set search_path = '' as $$
  with ranked_meetings as (
    select meeting.id, meeting.barangay_id,
      ((row_number() over (partition by meeting.barangay_id order by meeting.starts_at desc, meeting.id desc) - 1) / 20)::integer as page_number
    from public.meetings meeting
  )
  select e.id, m.id,
    coalesce(e.snapshot_title, meeting.title),
    coalesce(e.snapshot_location, meeting.location),
    coalesce(e.snapshot_starts_at, meeting.starts_at),
    coalesce(e.snapshot_ends_at, meeting.ends_at),
    m.page_number, e.changed_fields, e.reason
  from public.meeting_update_events e
  join ranked_meetings m on m.id = e.meeting_id and m.barangay_id = e.barangay_id
  join public.meetings meeting on meeting.id = e.meeting_id and meeting.barangay_id = e.barangay_id
  join public.meeting_attendees a on a.meeting_id = e.meeting_id
    and a.barangay_id = e.barangay_id and a.user_id = (select auth.uid())
  where e.id = any(coalesce(p_event_ids, '{}'::uuid[]))
    and public.is_active_member(e.barangay_id);
$$;
revoke all on function public.list_my_meeting_update_details(uuid[]) from public, anon;
grant execute on function public.list_my_meeting_update_details(uuid[]) to authenticated;
