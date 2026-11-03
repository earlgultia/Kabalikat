-- Notify project managers when an active Kagawad records progress or a milestone.
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
    'attendance_correction_request', 'committee_task_assignment', 'barangay_project_update'
  ));

create or replace function public.can_access_barangay_project_update_notification(
  p_project_id uuid,
  p_barangay_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member(p_barangay_id)
    and public.has_tenant_permission(p_barangay_id, 'project.manage')
    and exists (
      select 1 from public.barangay_projects project
      where project.id = p_project_id
        and project.barangay_id = p_barangay_id
    )
    and exists (
      select 1 from public.barangay_project_updates update_record
      where update_record.project_id = p_project_id
        and update_record.barangay_id = p_barangay_id
        and update_record.created_by <> (select auth.uid())
    );
$$;

revoke all on function public.can_access_barangay_project_update_notification(uuid, uuid) from public, anon;
grant execute on function public.can_access_barangay_project_update_notification(uuid, uuid) to authenticated;

create policy community_notifications_barangay_project_update_read
  on public.community_notifications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and resource_type = 'barangay_project_update'
    and public.can_access_barangay_project_update_notification(resource_id, barangay_id)
  );

create policy community_notifications_barangay_project_update_mark_read
  on public.community_notifications for update to authenticated
  using (
    recipient_id = (select auth.uid())
    and read_at is null
    and resource_type = 'barangay_project_update'
    and public.can_access_barangay_project_update_notification(resource_id, barangay_id)
  )
  with check (
    recipient_id = (select auth.uid())
    and read_at is not null
    and resource_type = 'barangay_project_update'
    and public.can_access_barangay_project_update_notification(resource_id, barangay_id)
  );

create or replace function public.notify_project_managers_of_kagawad_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.barangay_memberships membership
    join public.role_definitions role on role.id = membership.role_id
    where membership.barangay_id = new.barangay_id
      and membership.user_id = new.created_by
      and membership.status = 'active'
      and role.key = 'kagawad'
  ) then
    return new;
  end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select new.barangay_id, membership.user_id, 'barangay_project_update', new.project_id
  from public.barangay_memberships membership
  where membership.barangay_id = new.barangay_id
    and membership.status = 'active'
    and membership.user_id <> new.created_by
    and public.has_tenant_permission(new.barangay_id, 'project.manage')
  on conflict (recipient_id, resource_type, resource_id)
  do update set created_at = now(), read_at = null;

  return new;
end;
$$;

create trigger barangay_project_update_manager_notification
  after insert on public.barangay_project_updates
  for each row execute function public.notify_project_managers_of_kagawad_update();

revoke all on function public.notify_project_managers_of_kagawad_update() from public, anon, authenticated;
