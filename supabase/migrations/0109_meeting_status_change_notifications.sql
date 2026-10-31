-- Reuse attendee-scoped schedule notifications for completed/cancelled events.
alter table public.meeting_update_events add column if not exists reason text;

create or replace function public.notify_meeting_status_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
begin
  insert into public.meeting_update_events(meeting_id, barangay_id, changed_by, changed_fields, reason)
  values (new.meeting_id, new.barangay_id, new.actor_id, array['status', new.to_status::text], nullif(trim(new.reason), ''))
  returning id into v_event_id;

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
drop trigger if exists meeting_events_notify_attendees on public.meeting_events;
create trigger meeting_events_notify_attendees
  after insert on public.meeting_events
  for each row execute function public.notify_meeting_status_event();

drop function if exists public.list_my_meeting_update_details(uuid[]);
create function public.list_my_meeting_update_details(p_event_ids uuid[])
returns table (
  event_id uuid,
  meeting_id uuid,
  title text,
  starts_at timestamptz,
  page_number integer,
  changed_fields text[],
  reason text
)
language sql stable security invoker set search_path = '' as $$
  with ranked_meetings as (
    select meeting.id, meeting.barangay_id, meeting.title, meeting.starts_at,
      ((row_number() over (partition by meeting.barangay_id order by meeting.starts_at desc, meeting.id desc) - 1) / 20)::integer as page_number
    from public.meetings meeting
  )
  select e.id, m.id, m.title, m.starts_at, m.page_number, e.changed_fields, e.reason
  from public.meeting_update_events e
  join ranked_meetings m on m.id = e.meeting_id and m.barangay_id = e.barangay_id
  join public.meeting_attendees a on a.meeting_id = e.meeting_id
    and a.barangay_id = e.barangay_id and a.user_id = (select auth.uid())
  where e.id = any(coalesce(p_event_ids, '{}'::uuid[]))
    and public.is_active_member(e.barangay_id);
$$;
revoke all on function public.list_my_meeting_update_details(uuid[]) from public, anon;
grant execute on function public.list_my_meeting_update_details(uuid[]) to authenticated;
