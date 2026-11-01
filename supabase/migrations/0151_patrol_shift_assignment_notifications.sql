-- Notify only the Tanod currently assigned to a patrol shift.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check check (resource_type in (
    'announcement', 'disaster_advisory', 'resident_profile_change', 'document_request',
    'community_feedback', 'meeting_update', 'health_outreach_cancellation',
    'health_outreach_completion', 'health_outreach_review', 'health_outreach_published',
    'health_outreach_review_submission', 'health_outreach_rescheduled',
    'sk_event_review_submission', 'sk_event_published', 'sk_event_review_feedback',
    'sk_event_cancelled', 'sk_event_rescheduled', 'sk_event_completed',
    'incident_assignment', 'incident_status_change', 'patrol_shift_assignment'
  ));

drop policy if exists community_notifications_patrol_assignment_read on public.community_notifications;
create policy community_notifications_patrol_assignment_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and resource_type = 'patrol_shift_assignment'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'patrol.access')
    and exists (
      select 1 from public.patrol_shifts shift
      where shift.id = community_notifications.resource_id
        and shift.barangay_id = community_notifications.barangay_id
        and shift.assigned_to = (select auth.uid())
    )
  );

drop policy if exists community_notifications_patrol_assignment_mark_read on public.community_notifications;
create policy community_notifications_patrol_assignment_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid())
    and read_at is null
    and resource_type = 'patrol_shift_assignment'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'patrol.access')
    and exists (
      select 1 from public.patrol_shifts shift
      where shift.id = community_notifications.resource_id
        and shift.barangay_id = community_notifications.barangay_id
        and shift.assigned_to = (select auth.uid())
    )
  ) with check (
    recipient_id = (select auth.uid())
    and read_at is not null
    and resource_type = 'patrol_shift_assignment'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'patrol.access')
    and exists (
      select 1 from public.patrol_shifts shift
      where shift.id = community_notifications.resource_id
        and shift.barangay_id = community_notifications.barangay_id
        and shift.assigned_to = (select auth.uid())
    )
  );

create or replace function public.notify_patrol_shift_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is null then return new; end if;
  if tg_op = 'UPDATE' and old.assigned_to is not distinct from new.assigned_to then return new; end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  values (new.barangay_id, new.assigned_to, 'patrol_shift_assignment', new.id)
  on conflict (recipient_id, resource_type, resource_id)
  do update set created_at = now(), read_at = null;

  return new;
end;
$$;

revoke all on function public.notify_patrol_shift_assignee() from public, anon, authenticated;
drop trigger if exists patrol_shifts_notify_assignee on public.patrol_shifts;
create trigger patrol_shifts_notify_assignee
  after insert or update of assigned_to on public.patrol_shifts
  for each row execute function public.notify_patrol_shift_assignee();
