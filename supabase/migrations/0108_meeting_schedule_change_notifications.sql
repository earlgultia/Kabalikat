-- Deliver schedule-change alerts only to the affected meeting's invitees.
create table if not exists public.meeting_update_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null,
  barangay_id uuid not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_fields text[] not null,
  created_at timestamptz not null default now(),
  foreign key (meeting_id, barangay_id)
    references public.meetings(id, barangay_id) on delete restrict,
  check (cardinality(changed_fields) > 0)
);

create index if not exists meeting_update_events_meeting_history_idx
  on public.meeting_update_events(barangay_id, meeting_id, created_at desc, id desc);

alter table public.meeting_update_events enable row level security;
drop policy if exists meeting_update_events_invitee_read on public.meeting_update_events;
create policy meeting_update_events_invitee_read on public.meeting_update_events
  for select to authenticated using (
    public.is_active_member(barangay_id)
    and exists (
      select 1 from public.meeting_attendees a
      where a.meeting_id = meeting_update_events.meeting_id
        and a.barangay_id = meeting_update_events.barangay_id
        and a.user_id = (select auth.uid())
    )
  );
revoke all on public.meeting_update_events from public, anon, authenticated;
grant select on public.meeting_update_events to authenticated;

alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement','disaster_advisory','resident_profile_change',
    'document_request','community_feedback','meeting_update'
  ));

alter table public.community_notification_preferences
  drop constraint if exists community_notification_preferences_resource_type_check;
alter table public.community_notification_preferences
  add constraint community_notification_preferences_resource_type_check
  check (resource_type in ('announcement','disaster_advisory','meeting_update'));

create or replace function public.can_access_community_notification(
  p_resource_type text,
  p_resource_id uuid,
  p_barangay_id uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_member(p_barangay_id) and case p_resource_type
    when 'announcement' then exists (
      select 1 from public.announcements a
      where a.id = p_resource_id and a.barangay_id = p_barangay_id
        and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
        and case a.audience
          when 'public' then true
          when 'officials' then public.has_tenant_permission(p_barangay_id, 'announcement.officials.read')
          when 'residents' then exists (
            select 1 from public.barangay_memberships m
            join public.role_definitions r on r.id = m.role_id and r.key = 'resident'
            where m.user_id = (select auth.uid()) and m.barangay_id = p_barangay_id and m.status = 'active'
          )
          when 'role' then exists (
            select 1 from public.barangay_memberships m
            join public.role_definitions r on r.id = m.role_id and r.scope = 'barangay'
            where m.user_id = (select auth.uid()) and m.barangay_id = p_barangay_id
              and m.status = 'active' and m.role_id = a.audience_role_id
          )
          else false
        end
    )
    when 'disaster_advisory' then exists (
      select 1 from public.disaster_advisories a
      where a.id = p_resource_id and a.barangay_id = p_barangay_id
        and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
        and public.has_tenant_permission(p_barangay_id, 'disaster.read')
    )
    when 'resident_profile_change' then exists (
      select 1 from public.resident_profile_change_requests r
      where r.id = p_resource_id and r.barangay_id = p_barangay_id
        and r.requested_by = (select auth.uid()) and r.status in ('approved','rejected')
    )
    when 'document_request' then exists (
      select 1 from public.document_requests d
      join public.residents r on r.id = d.resident_id and r.barangay_id = d.barangay_id
      where d.id = p_resource_id and d.barangay_id = p_barangay_id and r.user_id = (select auth.uid())
    )
    when 'community_feedback' then exists (
      select 1 from public.community_feedback f
      where f.id = p_resource_id and f.barangay_id = p_barangay_id
        and f.submitted_by = (select auth.uid())
        and (f.status = 'closed' or (f.status = 'responded' and f.staff_response is not null))
    )
    when 'meeting_update' then exists (
      select 1 from public.meeting_update_events e
      join public.meeting_attendees a
        on a.meeting_id = e.meeting_id and a.barangay_id = e.barangay_id
      where e.id = p_resource_id and e.barangay_id = p_barangay_id
        and a.user_id = (select auth.uid())
    )
    else false
  end;
$$;
revoke all on function public.can_access_community_notification(text, uuid, uuid) from public, anon;
grant execute on function public.can_access_community_notification(text, uuid, uuid) to authenticated;

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

  insert into public.meeting_update_events(meeting_id, barangay_id, changed_by, changed_fields)
  values (new.id, new.barangay_id, auth.uid(), v_fields)
  returning id into v_event_id;

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
drop trigger if exists meetings_notify_schedule_update on public.meetings;
create trigger meetings_notify_schedule_update
  after update of title, location, starts_at, ends_at, agenda on public.meetings
  for each row execute function public.notify_meeting_schedule_update();

create or replace function public.list_my_meeting_update_details(p_event_ids uuid[])
returns table (event_id uuid, meeting_id uuid, title text, starts_at timestamptz, page_number integer)
language sql stable security invoker set search_path = '' as $$
  with ranked_meetings as (
    select meeting.id, meeting.barangay_id, meeting.title, meeting.starts_at,
      ((row_number() over (partition by meeting.barangay_id order by meeting.starts_at desc, meeting.id desc) - 1) / 20)::integer as page_number
    from public.meetings meeting
  )
  select e.id, m.id, m.title, m.starts_at, m.page_number
  from public.meeting_update_events e
  join ranked_meetings m on m.id = e.meeting_id and m.barangay_id = e.barangay_id
  join public.meeting_attendees a on a.meeting_id = e.meeting_id
    and a.barangay_id = e.barangay_id and a.user_id = (select auth.uid())
  where e.id = any(coalesce(p_event_ids, '{}'::uuid[]))
    and public.is_active_member(e.barangay_id);
$$;
revoke all on function public.list_my_meeting_update_details(uuid[]) from public, anon;
grant execute on function public.list_my_meeting_update_details(uuid[]) to authenticated;
