-- Deliver in-app updates only to the requester who owns the affected ticket.
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
    'patrol_shift_completed', 'support_ticket_update'
  ));

create or replace function public.can_access_support_ticket_update_notification(
  p_resource_id uuid,
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
      select 1 from public.support_tickets as ticket
      where ticket.id = p_resource_id
        and ticket.barangay_id = p_barangay_id
        and ticket.requester_id = (select auth.uid())
    );
$$;

revoke all on function public.can_access_support_ticket_update_notification(uuid, uuid) from public, anon;
grant execute on function public.can_access_support_ticket_update_notification(uuid, uuid) to authenticated;

drop policy community_notifications_read on public.community_notifications;
create policy community_notifications_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and public.is_active_member(barangay_id)
    and (
      public.can_access_community_notification(resource_type, resource_id, barangay_id)
      or (resource_type = 'support_ticket_update'
        and public.can_access_support_ticket_update_notification(resource_id, barangay_id))
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
    )
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null
    and public.is_active_member(barangay_id)
    and (
      public.can_access_community_notification(resource_type, resource_id, barangay_id)
      or (resource_type = 'support_ticket_update'
        and public.can_access_support_ticket_update_notification(resource_id, barangay_id))
    )
  );

create or replace function public.notify_support_ticket_public_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.support_tickets%rowtype;
begin
  if new.visibility <> 'requester' then return new; end if;

  select * into v_ticket
  from public.support_tickets as ticket
  where ticket.id = new.ticket_id;

  if not found or v_ticket.requester_id = new.author_id then return new; end if;
  if not exists (
    select 1 from public.barangay_memberships as membership
    where membership.user_id = v_ticket.requester_id
      and membership.barangay_id = v_ticket.barangay_id
      and membership.status = 'active'
  ) then return new; end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  values (v_ticket.barangay_id, v_ticket.requester_id, 'support_ticket_update', v_ticket.id)
  on conflict (recipient_id, resource_type, resource_id)
  do update set created_at = now(), read_at = null;
  return new;
end;
$$;

create trigger support_messages_notify_requester
  after insert on public.support_messages
  for each row execute function public.notify_support_ticket_public_reply();

create or replace function public.notify_support_ticket_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is not distinct from new.status
    or new.requester_id = (select auth.uid()) then return new; end if;
  if not exists (
    select 1 from public.barangay_memberships as membership
    where membership.user_id = new.requester_id
      and membership.barangay_id = new.barangay_id
      and membership.status = 'active'
  ) then return new; end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  values (new.barangay_id, new.requester_id, 'support_ticket_update', new.id)
  on conflict (recipient_id, resource_type, resource_id)
  do update set created_at = now(), read_at = null;
  return new;
end;
$$;

create trigger support_tickets_notify_requester_status
  after update of status on public.support_tickets
  for each row execute function public.notify_support_ticket_status_change();

revoke all on function public.notify_support_ticket_public_reply() from public, anon, authenticated;
revoke all on function public.notify_support_ticket_status_change() from public, anon, authenticated;
