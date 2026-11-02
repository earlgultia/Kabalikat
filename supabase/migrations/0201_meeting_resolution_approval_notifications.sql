-- Notify the resolution proposer after approval, using the existing in-app
-- notification inbox and the member's meeting-update preference.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check check (resource_type in (
    'announcement', 'disaster_advisory', 'resident_profile_change', 'document_request',
    'community_feedback', 'meeting_update', 'meeting_resolution',
    'health_outreach_cancellation', 'health_outreach_completion', 'health_outreach_review',
    'health_outreach_published', 'health_outreach_review_submission', 'health_outreach_rescheduled',
    'sk_event_review_submission', 'sk_event_published', 'sk_event_review_feedback',
    'sk_event_cancelled', 'sk_event_rescheduled', 'sk_event_completed',
    'incident_assignment', 'incident_status_change', 'patrol_shift_assignment',
    'patrol_shift_cancelled', 'patrol_shift_rescheduled', 'patrol_shift_started',
    'patrol_shift_completed', 'support_ticket_update'
  ));

create or replace function public.can_access_meeting_resolution_notification(
  p_resource_id uuid,
  p_barangay_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member(p_barangay_id) and exists (
    select 1 from public.meeting_resolutions resolution
    where resolution.id = p_resource_id
      and resolution.barangay_id = p_barangay_id
      and resolution.proposed_by = (select auth.uid())
      and resolution.status = 'approved'
  );
$$;

revoke all on function public.can_access_meeting_resolution_notification(uuid, uuid) from public, anon;
grant execute on function public.can_access_meeting_resolution_notification(uuid, uuid) to authenticated;

drop policy community_notifications_read on public.community_notifications;
create policy community_notifications_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and public.is_active_member(barangay_id)
    and (
      public.can_access_community_notification(resource_type, resource_id, barangay_id)
      or (resource_type = 'support_ticket_update'
        and public.can_access_support_ticket_update_notification(resource_id, barangay_id))
      or (resource_type = 'meeting_resolution'
        and public.can_access_meeting_resolution_notification(resource_id, barangay_id))
    )
  );

drop policy community_notifications_mark_read on public.community_notifications;
create policy community_notifications_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null
    and public.is_active_member(barangay_id)
    and (
      public.can_access_community_notification(resource_type, resource_id, barangay_id)
      or (resource_type = 'support_ticket_update'
        and public.can_access_support_ticket_update_notification(resource_id, barangay_id))
      or (resource_type = 'meeting_resolution'
        and public.can_access_meeting_resolution_notification(resource_id, barangay_id))
    )
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null
    and public.is_active_member(barangay_id)
    and (
      public.can_access_community_notification(resource_type, resource_id, barangay_id)
      or (resource_type = 'support_ticket_update'
        and public.can_access_support_ticket_update_notification(resource_id, barangay_id))
      or (resource_type = 'meeting_resolution'
        and public.can_access_meeting_resolution_notification(resource_id, barangay_id))
    )
  );

create or replace function public.approve_meeting_resolution(p_resolution_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolution public.meeting_resolutions%rowtype;
begin
  select * into v_resolution
  from public.meeting_resolutions
  where id = p_resolution_id
  for update;

  if not found or not public.has_tenant_permission(v_resolution.barangay_id, 'meeting.manage') then
    raise exception 'not authorized';
  end if;
  if v_resolution.status <> 'draft' then
    raise exception 'resolution is not awaiting approval';
  end if;

  update public.meeting_resolutions
  set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), updated_at = now()
  where id = v_resolution.id;

  insert into public.meeting_record_events(barangay_id, meeting_id, resolution_id, actor_id, action, from_status, to_status)
  values (v_resolution.barangay_id, v_resolution.meeting_id, v_resolution.id, (select auth.uid()), 'resolution_approved', 'draft', 'approved');

  if v_resolution.proposed_by <> (select auth.uid()) and not exists (
    select 1 from public.community_notification_preferences preference
    where preference.user_id = v_resolution.proposed_by
      and preference.barangay_id = v_resolution.barangay_id
      and preference.resource_type = 'meeting_update'
      and preference.enabled = false
  ) then
    insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
    values (v_resolution.barangay_id, v_resolution.proposed_by, 'meeting_resolution', v_resolution.id)
    on conflict (recipient_id, resource_type, resource_id)
    do update set created_at = now(), read_at = null;
  end if;
end;
$$;

revoke all on function public.approve_meeting_resolution(uuid) from public, anon;
grant execute on function public.approve_meeting_resolution(uuid) to authenticated;
