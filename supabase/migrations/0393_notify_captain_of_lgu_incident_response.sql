-- Notify active Barangay Captains when their municipality acknowledges or
-- resolves an incident escalation. The notification stores only the incident
-- reference; report details remain behind the incident access controls.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;

alter table public.community_notifications
  add constraint community_notifications_resource_type_check check (resource_type in (
    'announcement', 'disaster_advisory', 'resident_profile_change', 'document_request',
    'community_feedback', 'meeting_update', 'meeting_resolution', 'health_outreach_cancellation',
    'health_outreach_completion', 'health_outreach_review', 'health_outreach_published',
    'health_outreach_review_submission', 'health_outreach_rescheduled', 'sk_event_review_submission',
    'sk_event_published', 'sk_event_review_feedback', 'sk_event_cancelled', 'sk_event_rescheduled',
    'sk_event_completed', 'incident_assignment', 'incident_status_change', 'lgu_incident_response',
    'patrol_shift_assignment', 'patrol_shift_cancelled', 'patrol_shift_rescheduled',
    'patrol_shift_started', 'patrol_shift_completed', 'support_ticket_update',
    'committee_task_update', 'committee_task_progress', 'committee_due_date_request',
    'attendance_correction_request', 'committee_task_assignment', 'barangay_project_update',
    'barangay_project_update_response', 'committee_due_date_decision'
  ));

create or replace function public.can_access_lgu_incident_response_notification(
  p_incident_id uuid,
  p_barangay_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barangay_memberships membership
    join public.role_definitions role on role.id = membership.role_id
    join public.lgu_incident_escalations escalation
      on escalation.barangay_id = membership.barangay_id
     and escalation.incident_id = p_incident_id
     and escalation.status in ('acknowledged','resolved')
    join public.barangays barangay
      on barangay.id = escalation.barangay_id
     and barangay.lgu_id = escalation.lgu_id
    where membership.barangay_id = p_barangay_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and role.key = 'captain'
  );
$$;

revoke all on function public.can_access_lgu_incident_response_notification(uuid,uuid) from public,anon;
grant execute on function public.can_access_lgu_incident_response_notification(uuid,uuid) to authenticated;

drop policy if exists community_notifications_lgu_incident_response_read on public.community_notifications;
create policy community_notifications_lgu_incident_response_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and resource_type = 'lgu_incident_response'
    and public.can_access_lgu_incident_response_notification(resource_id,barangay_id)
  );

drop policy if exists community_notifications_lgu_incident_response_mark_read on public.community_notifications;
create policy community_notifications_lgu_incident_response_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid())
    and read_at is null
    and resource_type = 'lgu_incident_response'
    and public.can_access_lgu_incident_response_notification(resource_id,barangay_id)
  ) with check (
    recipient_id = (select auth.uid())
    and read_at is not null
    and resource_type = 'lgu_incident_response'
    and public.can_access_lgu_incident_response_notification(resource_id,barangay_id)
  );

create or replace function public.notify_captain_of_lgu_incident_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is not distinct from new.status
    or new.status not in ('acknowledged','resolved') then
    return new;
  end if;

  insert into public.community_notifications(barangay_id,recipient_id,resource_type,resource_id)
  select new.barangay_id,membership.user_id,'lgu_incident_response',new.incident_id
  from public.barangay_memberships membership
  join public.role_definitions role on role.id = membership.role_id
  where membership.barangay_id = new.barangay_id
    and membership.status = 'active'
    and role.key = 'captain'
  on conflict (recipient_id,resource_type,resource_id)
  do update set created_at = now(),read_at = null;

  return new;
end;
$$;

revoke all on function public.notify_captain_of_lgu_incident_response() from public,anon,authenticated;
drop trigger if exists lgu_incident_response_notify_captain on public.lgu_incident_escalations;
create trigger lgu_incident_response_notify_captain
  after update of status on public.lgu_incident_escalations
  for each row execute function public.notify_captain_of_lgu_incident_response();
