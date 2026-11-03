-- Notify the current assignee when a committee manager replies to a task note.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement', 'disaster_advisory', 'resident_profile_change', 'document_request',
    'community_feedback', 'meeting_update', 'health_outreach_cancellation',
    'health_outreach_completion', 'health_outreach_review', 'health_outreach_published',
    'health_outreach_review_submission', 'health_outreach_rescheduled',
    'sk_event_review_submission', 'sk_event_published', 'sk_event_review_feedback',
    'sk_event_cancelled', 'sk_event_rescheduled', 'sk_event_completed',
    'incident_assignment', 'incident_status_change', 'patrol_shift_assignment',
    'patrol_shift_cancelled', 'patrol_shift_rescheduled', 'patrol_shift_started',
    'patrol_shift_completed', 'support_ticket_update', 'committee_task_update'
  ));

create or replace function public.can_access_committee_task_update_notification(
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
      from public.committee_tasks task
      join public.committees committee
        on committee.id = task.committee_id
       and committee.barangay_id = task.barangay_id
      join public.barangay_memberships membership
        on membership.barangay_id = task.barangay_id
       and membership.user_id = (select auth.uid())
       and membership.status = 'active'
      where task.id = p_task_id
        and task.barangay_id = p_barangay_id
        and task.assigned_to = (select auth.uid())
        and committee.status = 'active'
        and exists (
          select 1 from public.committee_task_progress_notes note
          where note.task_id = task.id and note.author_id <> (select auth.uid())
        )
    );
$$;

revoke all on function public.can_access_committee_task_update_notification(uuid, uuid) from public, anon;
grant execute on function public.can_access_committee_task_update_notification(uuid, uuid) to authenticated;

create policy community_notifications_committee_task_update_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and resource_type = 'committee_task_update'
    and public.can_access_committee_task_update_notification(resource_id, barangay_id)
  );

create policy community_notifications_committee_task_update_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null
    and resource_type = 'committee_task_update'
    and public.can_access_committee_task_update_notification(resource_id, barangay_id)
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null
    and resource_type = 'committee_task_update'
    and public.can_access_committee_task_update_notification(resource_id, barangay_id)
  );

create or replace function public.notify_committee_task_assignee_of_manager_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.committee_tasks%rowtype;
begin
  select task.* into v_task
  from public.committee_tasks task
  join public.committees committee
    on committee.id = task.committee_id
   and committee.barangay_id = task.barangay_id
  where task.id = new.task_id and committee.status = 'active';

  if not found
    or v_task.assigned_to is null
    or v_task.assigned_to = new.author_id
    or not public.has_tenant_permission(v_task.barangay_id, 'committee.manage')
    or not exists (
      select 1 from public.barangay_memberships membership
      where membership.barangay_id = v_task.barangay_id
        and membership.user_id = v_task.assigned_to
        and membership.status = 'active'
    ) then
    return new;
  end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  values (v_task.barangay_id, v_task.assigned_to, 'committee_task_update', v_task.id)
  on conflict (recipient_id, resource_type, resource_id)
  do update set created_at = now(), read_at = null;
  return new;
end;
$$;

create trigger committee_task_manager_response_notification
  after insert on public.committee_task_progress_notes
  for each row execute function public.notify_committee_task_assignee_of_manager_response();

revoke all on function public.notify_committee_task_assignee_of_manager_response() from public, anon, authenticated;
