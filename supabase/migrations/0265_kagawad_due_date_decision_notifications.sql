-- Tell a Kagawad when a manager approves or declines their due-date request.
-- The notification points to the task so its existing history panel shows the
-- saved decision, reviewer, and note without exposing the request table.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;

alter table public.community_notifications
  add constraint community_notifications_resource_type_check check (resource_type in (
    'announcement', 'disaster_advisory', 'resident_profile_change', 'document_request',
    'community_feedback', 'meeting_update', 'meeting_resolution', 'health_outreach_cancellation',
    'health_outreach_completion', 'health_outreach_review', 'health_outreach_published',
    'health_outreach_review_submission', 'health_outreach_rescheduled', 'sk_event_review_submission',
    'sk_event_published', 'sk_event_review_feedback', 'sk_event_cancelled', 'sk_event_rescheduled',
    'sk_event_completed', 'incident_assignment', 'incident_status_change', 'patrol_shift_assignment',
    'patrol_shift_cancelled', 'patrol_shift_rescheduled', 'patrol_shift_started', 'patrol_shift_completed',
    'support_ticket_update', 'committee_task_update', 'committee_task_progress', 'committee_due_date_request',
    'attendance_correction_request', 'committee_task_assignment', 'barangay_project_update',
    'barangay_project_update_response', 'committee_due_date_decision'
  ));

create or replace function public.notify_kagawad_of_due_date_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'pending' or new.status not in ('approved', 'declined') then
    return new;
  end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select new.barangay_id, new.requester_id, 'committee_due_date_decision', new.task_id
  where exists (
    select 1
    from public.barangay_memberships membership
    join public.role_definitions role on role.id = membership.role_id
    where membership.barangay_id = new.barangay_id
      and membership.user_id = new.requester_id
      and membership.status = 'active'
      and role.key = 'kagawad'
  )
  on conflict (recipient_id, resource_type, resource_id)
  do update set created_at = now(), read_at = null;

  return new;
end;
$$;

drop trigger if exists committee_due_date_decision_notification on public.committee_task_due_date_requests;
create trigger committee_due_date_decision_notification
  after update of status on public.committee_task_due_date_requests
  for each row execute function public.notify_kagawad_of_due_date_decision();

create or replace function public.can_access_committee_due_date_decision_notification(
  p_task_id uuid,
  p_barangay_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member(p_barangay_id)
    and exists (
      select 1
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    )
    and exists (
      select 1
      from public.committee_task_due_date_requests request
      join public.committees committee
        on committee.id = request.committee_id
       and committee.barangay_id = request.barangay_id
      where request.task_id = p_task_id
        and request.barangay_id = p_barangay_id
        and request.requester_id = (select auth.uid())
        and request.status in ('approved', 'declined')
        and committee.status = 'active'
    );
$$;

revoke all on function public.notify_kagawad_of_due_date_decision() from public, anon, authenticated;
revoke all on function public.can_access_committee_due_date_decision_notification(uuid, uuid) from public, anon;
grant execute on function public.can_access_committee_due_date_decision_notification(uuid, uuid) to authenticated;

drop policy if exists community_notifications_committee_due_date_decision_read on public.community_notifications;
create policy community_notifications_committee_due_date_decision_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and resource_type = 'committee_due_date_decision'
    and public.can_access_committee_due_date_decision_notification(resource_id, barangay_id)
  );

drop policy if exists community_notifications_committee_due_date_decision_mark_read on public.community_notifications;
create policy community_notifications_committee_due_date_decision_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null
    and resource_type = 'committee_due_date_decision'
    and public.can_access_committee_due_date_decision_notification(resource_id, barangay_id)
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null
    and resource_type = 'committee_due_date_decision'
    and public.can_access_committee_due_date_decision_notification(resource_id, barangay_id)
  );
