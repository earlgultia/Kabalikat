-- Let Captains reschedule future shifts through an audited RPC and alert the assigned Tanod.
alter table public.patrol_shift_logs
  drop constraint if exists patrol_shift_logs_entry_type_check;
alter table public.patrol_shift_logs
  add constraint patrol_shift_logs_entry_type_check check (entry_type in (
    'shift_started', 'checkpoint', 'observation', 'shift_completed', 'shift_cancelled', 'shift_rescheduled'
  ));

create or replace function public.reschedule_patrol_shift(
  p_shift_id uuid,
  p_title text,
  p_patrol_area text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.patrol_shifts%rowtype;
  v_details text;
begin
  select * into v_shift from public.patrol_shifts where id = p_shift_id for update;
  if not found or not public.has_tenant_permission(v_shift.barangay_id, 'patrol.manage') then
    raise exception 'not authorized';
  end if;

  if v_shift.status <> 'scheduled' or v_shift.starts_at <= now()
     or p_starts_at is null or p_starts_at <= now() or p_ends_at is null
     or p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '12 hours'
     or length(trim(coalesce(p_title, ''))) not between 3 and 140
     or length(trim(coalesce(p_patrol_area, ''))) not between 2 and 240
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'a future scheduled shift, valid details, and a reason are required';
  end if;

  v_details := left(format(
    'Previous: %s | %s to %s%sNew: %s | %s to %s%sReason: %s',
    v_shift.title, v_shift.starts_at, v_shift.ends_at, chr(10),
    trim(p_title), p_starts_at, p_ends_at, chr(10), trim(p_reason)
  ), 1500);

  update public.patrol_shifts
  set title = trim(p_title), patrol_area = trim(p_patrol_area),
      starts_at = p_starts_at, ends_at = p_ends_at, updated_at = now()
  where id = v_shift.id;

  insert into public.patrol_shift_logs(barangay_id, shift_id, actor_id, entry_type, details)
  values (v_shift.barangay_id, v_shift.id, auth.uid(), 'shift_rescheduled', v_details);
end;
$$;

revoke all on function public.reschedule_patrol_shift(uuid, text, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.reschedule_patrol_shift(uuid, text, text, timestamptz, timestamptz, text) to authenticated;

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
    'patrol_shift_cancelled', 'patrol_shift_rescheduled'
  ));

drop policy if exists community_notifications_patrol_reschedule_read on public.community_notifications;
create policy community_notifications_patrol_reschedule_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and resource_type = 'patrol_shift_rescheduled'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'patrol.access')
    and exists (
      select 1 from public.patrol_shifts shift
      where shift.id = community_notifications.resource_id
        and shift.barangay_id = community_notifications.barangay_id
        and shift.assigned_to = (select auth.uid())
        and shift.status = 'scheduled'
    )
  );

drop policy if exists community_notifications_patrol_reschedule_mark_read on public.community_notifications;
create policy community_notifications_patrol_reschedule_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid())
    and read_at is null
    and resource_type = 'patrol_shift_rescheduled'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'patrol.access')
    and exists (
      select 1 from public.patrol_shifts shift
      where shift.id = community_notifications.resource_id
        and shift.barangay_id = community_notifications.barangay_id
        and shift.assigned_to = (select auth.uid())
        and shift.status = 'scheduled'
    )
  ) with check (
    recipient_id = (select auth.uid())
    and read_at is not null
    and resource_type = 'patrol_shift_rescheduled'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'patrol.access')
    and exists (
      select 1 from public.patrol_shifts shift
      where shift.id = community_notifications.resource_id
        and shift.barangay_id = community_notifications.barangay_id
        and shift.assigned_to = (select auth.uid())
        and shift.status = 'scheduled'
    )
  );

create or replace function public.notify_patrol_shift_rescheduled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'scheduled' or new.assigned_to is null
     or (old.title is not distinct from new.title
         and old.patrol_area is not distinct from new.patrol_area
         and old.starts_at is not distinct from new.starts_at
         and old.ends_at is not distinct from new.ends_at) then
    return new;
  end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  values (new.barangay_id, new.assigned_to, 'patrol_shift_rescheduled', new.id)
  on conflict (recipient_id, resource_type, resource_id)
  do update set created_at = now(), read_at = null;

  return new;
end;
$$;

revoke all on function public.notify_patrol_shift_rescheduled() from public, anon, authenticated;
drop trigger if exists patrol_shifts_notify_rescheduled on public.patrol_shifts;
create trigger patrol_shifts_notify_rescheduled
  after update of title, patrol_area, starts_at, ends_at on public.patrol_shifts
  for each row execute function public.notify_patrol_shift_rescheduled();
