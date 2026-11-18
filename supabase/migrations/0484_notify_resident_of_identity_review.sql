-- Notify only the linked resident that their confidential ID review is done.
-- The notice carries a submission pointer and no ID image or review note.
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
    'barangay_project_update_response', 'committee_due_date_decision', 'resident_identity_review'
  ));

create or replace function public.can_read_resident_identity_review_notification(
  p_submission_id uuid,
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
    from public.resident_identity_submissions submission
    join public.residents resident
      on resident.id = submission.resident_id
     and resident.barangay_id = submission.barangay_id
    where submission.id = p_submission_id
      and submission.barangay_id = p_barangay_id
      and submission.status in ('verified', 'rejected')
      and resident.user_id = (select auth.uid())
      and public.is_active_member(p_barangay_id)
  );
$$;
revoke all on function public.can_read_resident_identity_review_notification(uuid, uuid) from public, anon;
grant execute on function public.can_read_resident_identity_review_notification(uuid, uuid) to authenticated;

drop policy if exists community_notifications_identity_review_read on public.community_notifications;
create policy community_notifications_identity_review_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and resource_type = 'resident_identity_review'
    and public.can_read_resident_identity_review_notification(resource_id, barangay_id)
  );

drop policy if exists community_notifications_identity_review_mark_read on public.community_notifications;
create policy community_notifications_identity_review_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid())
    and read_at is null
    and resource_type = 'resident_identity_review'
    and public.can_read_resident_identity_review_notification(resource_id, barangay_id)
  ) with check (
    recipient_id = (select auth.uid())
    and read_at is not null
    and resource_type = 'resident_identity_review'
    and public.can_read_resident_identity_review_notification(resource_id, barangay_id)
  );

create or replace function public.notify_resident_of_identity_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is not distinct from new.status
    or new.status not in ('verified', 'rejected') then
    return new;
  end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select new.barangay_id, resident.user_id, 'resident_identity_review', new.id
  from public.residents resident
  join public.barangay_memberships membership
    on membership.barangay_id = new.barangay_id
   and membership.user_id = resident.user_id
   and membership.status = 'active'
  where resident.id = new.resident_id
    and resident.barangay_id = new.barangay_id
    and resident.user_id is not null
    and resident.user_id is distinct from new.reviewer_id
  on conflict (recipient_id, resource_type, resource_id) do update
    set created_at = now(), read_at = null;

  return new;
end;
$$;
revoke all on function public.notify_resident_of_identity_review() from public, anon, authenticated;

drop trigger if exists resident_identity_review_notify_resident on public.resident_identity_submissions;
create trigger resident_identity_review_notify_resident
  after update of status on public.resident_identity_submissions
  for each row execute function public.notify_resident_of_identity_review();
