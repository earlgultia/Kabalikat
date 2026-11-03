-- Notify reviewers of new correction requests and the Kagawad after a decision.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement', 'disaster_advisory', 'resident_profile_change', 'document_request',
    'community_feedback', 'meeting_update', 'meeting_resolution', 'health_outreach_cancellation',
    'health_outreach_completion', 'health_outreach_review', 'health_outreach_published',
    'health_outreach_review_submission', 'health_outreach_rescheduled', 'sk_event_review_submission',
    'sk_event_published', 'sk_event_review_feedback', 'sk_event_cancelled', 'sk_event_rescheduled',
    'sk_event_completed', 'incident_assignment', 'incident_status_change', 'patrol_shift_assignment',
    'patrol_shift_cancelled', 'patrol_shift_rescheduled', 'patrol_shift_started', 'patrol_shift_completed',
    'support_ticket_update', 'committee_task_update', 'committee_task_progress', 'committee_due_date_request',
    'attendance_correction_request'
  ));

create or replace function public.can_access_attendance_correction_notification(
  p_request_id uuid,
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
      select 1 from public.meeting_attendance_correction_requests request
      where request.id = p_request_id
        and request.barangay_id = p_barangay_id
        and (request.requester_id = (select auth.uid())
          or public.has_tenant_permission(p_barangay_id, 'attendance.manage'))
    );
$$;

revoke all on function public.can_access_attendance_correction_notification(uuid, uuid) from public, anon;
grant execute on function public.can_access_attendance_correction_notification(uuid, uuid) to authenticated;

create policy community_notifications_attendance_correction_read
  on public.community_notifications for select to authenticated
  using (recipient_id = (select auth.uid())
    and resource_type = 'attendance_correction_request'
    and public.can_access_attendance_correction_notification(resource_id, barangay_id));

create policy community_notifications_attendance_correction_mark_read
  on public.community_notifications for update to authenticated
  using (recipient_id = (select auth.uid()) and read_at is null
    and resource_type = 'attendance_correction_request'
    and public.can_access_attendance_correction_notification(resource_id, barangay_id))
  with check (recipient_id = (select auth.uid()) and read_at is not null
    and resource_type = 'attendance_correction_request'
    and public.can_access_attendance_correction_notification(resource_id, barangay_id));

create or replace function public.notify_attendance_correction_request_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select new.barangay_id, membership.user_id, 'attendance_correction_request', new.id
  from public.barangay_memberships membership
  where membership.barangay_id = new.barangay_id
    and membership.status = 'active'
    and membership.user_id <> new.requester_id
    and exists (
      select 1
      from public.role_permissions role_permission
      join public.permissions permission on permission.id = role_permission.permission_id
        and permission.key = 'attendance.manage'
      left join public.membership_permissions override
        on override.membership_id = membership.id
       and override.permission_id = permission.id
      where role_permission.role_id = membership.role_id
        and coalesce(override.effect, 'allow') = 'allow'
    )
  on conflict (recipient_id, resource_type, resource_id) do nothing;
  return new;
end;
$$;

create or replace function public.notify_kagawad_of_attendance_correction_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
    values (new.barangay_id, new.requester_id, 'attendance_correction_request', new.id)
    on conflict (recipient_id, resource_type, resource_id)
    do update set created_at = now(), read_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists meeting_attendance_correction_request_notification
  on public.meeting_attendance_correction_requests;
create trigger meeting_attendance_correction_request_notification
  after insert on public.meeting_attendance_correction_requests
  for each row execute function public.notify_attendance_correction_request_created();

drop trigger if exists kagawad_attendance_correction_decision_notification
  on public.meeting_attendance_correction_requests;
create trigger kagawad_attendance_correction_decision_notification
  after update of status on public.meeting_attendance_correction_requests
  for each row execute function public.notify_kagawad_of_attendance_correction_decision();

revoke all on function public.notify_attendance_correction_request_created() from public, anon, authenticated;
revoke all on function public.notify_kagawad_of_attendance_correction_decision() from public, anon, authenticated;
