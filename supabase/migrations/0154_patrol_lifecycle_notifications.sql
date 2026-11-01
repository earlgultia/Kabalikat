-- Keep Captains informed when assigned Tanods start and finish patrol shifts.
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
    'incident_assignment', 'incident_status_change', 'patrol_shift_assignment',
    'patrol_shift_cancelled', 'patrol_shift_rescheduled', 'patrol_shift_started',
    'patrol_shift_completed'
  ));

drop policy if exists community_notifications_patrol_lifecycle_read on public.community_notifications;
create policy community_notifications_patrol_lifecycle_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and resource_type in ('patrol_shift_started', 'patrol_shift_completed')
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'patrol.manage')
    and exists (
      select 1 from public.patrol_shifts shift
      where shift.id = community_notifications.resource_id
        and shift.barangay_id = community_notifications.barangay_id
        and (
          (community_notifications.resource_type = 'patrol_shift_started' and shift.status in ('active', 'completed'))
          or (community_notifications.resource_type = 'patrol_shift_completed' and shift.status = 'completed')
        )
    )
  );

drop policy if exists community_notifications_patrol_lifecycle_mark_read on public.community_notifications;
create policy community_notifications_patrol_lifecycle_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid())
    and read_at is null
    and resource_type in ('patrol_shift_started', 'patrol_shift_completed')
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'patrol.manage')
    and exists (
      select 1 from public.patrol_shifts shift
      where shift.id = community_notifications.resource_id
        and shift.barangay_id = community_notifications.barangay_id
        and (
          (community_notifications.resource_type = 'patrol_shift_started' and shift.status in ('active', 'completed'))
          or (community_notifications.resource_type = 'patrol_shift_completed' and shift.status = 'completed')
        )
    )
  ) with check (
    recipient_id = (select auth.uid())
    and read_at is not null
    and resource_type in ('patrol_shift_started', 'patrol_shift_completed')
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'patrol.manage')
    and exists (
      select 1 from public.patrol_shifts shift
      where shift.id = community_notifications.resource_id
        and shift.barangay_id = community_notifications.barangay_id
        and (
          (community_notifications.resource_type = 'patrol_shift_started' and shift.status in ('active', 'completed'))
          or (community_notifications.resource_type = 'patrol_shift_completed' and shift.status = 'completed')
        )
    )
  );

create or replace function public.notify_patrol_shift_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource_type text;
begin
  if old.status = 'scheduled' and new.status = 'active' then
    v_resource_type := 'patrol_shift_started';
  elsif old.status = 'active' and new.status = 'completed' then
    v_resource_type := 'patrol_shift_completed';
  else
    return new;
  end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select new.barangay_id, member.user_id, v_resource_type, new.id
  from public.barangay_memberships member
  join public.role_permissions role_permission on role_permission.role_id = member.role_id
  join public.permissions permission on permission.id = role_permission.permission_id
  where member.barangay_id = new.barangay_id
    and member.status = 'active'
    and permission.key = 'patrol.manage'
  on conflict (recipient_id, resource_type, resource_id)
  do update set created_at = now(), read_at = null;

  return new;
end;
$$;

revoke all on function public.notify_patrol_shift_lifecycle() from public, anon, authenticated;
drop trigger if exists patrol_shifts_notify_lifecycle on public.patrol_shifts;
create trigger patrol_shifts_notify_lifecycle
  after update of status on public.patrol_shifts
  for each row execute function public.notify_patrol_shift_lifecycle();
