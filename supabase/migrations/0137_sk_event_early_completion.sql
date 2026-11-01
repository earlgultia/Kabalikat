-- Allow started SK events to close early, with a reason and member-facing notice.
alter table public.sk_event_events drop constraint if exists sk_event_events_action_check;
alter table public.sk_event_events add constraint sk_event_events_action_check
  check (action in (
    'event_created', 'event_published', 'event_rejected', 'event_completed',
    'event_completed_early', 'event_changes_requested', 'event_updated',
    'event_resubmitted', 'event_cancelled', 'event_rescheduled'
  ));

drop function if exists public.complete_sk_event(uuid);
create function public.complete_sk_event(p_event_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.sk_events%rowtype;
  v_early boolean;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_event from public.sk_events where id = p_event_id for update;
  if not found or not public.has_tenant_permission(v_event.barangay_id, 'sk.event.manage') then
    raise exception 'not authorized';
  end if;
  if v_event.status <> 'published' then raise exception 'only a published event can be completed'; end if;
  v_early := v_event.ends_at > now();
  if v_early and v_event.starts_at > now() then raise exception 'an event cannot be completed before it starts'; end if;
  if v_early and length(coalesce(v_reason, '')) not between 3 and 1000 then
    raise exception 'an early completion reason is required';
  end if;

  update public.sk_events set status = 'completed', completed_at = now() where id = v_event.id;
  insert into public.sk_event_events(barangay_id, event_id, actor_id, action, note)
  values (v_event.barangay_id, v_event.id, (select auth.uid()),
    case when v_early then 'event_completed_early' else 'event_completed' end,
    case when v_early then v_reason else '' end);

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select v_event.barangay_id, membership.user_id, 'sk_event_completed', v_event.id
  from public.barangay_memberships membership
  where membership.barangay_id = v_event.barangay_id and membership.status = 'active'
    and membership.user_id is distinct from (select auth.uid())
    and not exists (
      select 1 from public.community_notification_preferences preference
      where preference.user_id = membership.user_id and preference.barangay_id = v_event.barangay_id
        and preference.resource_type = 'sk_event_update' and preference.enabled = false
    )
  on conflict (recipient_id, resource_type, resource_id) do nothing;
end;
$$;
revoke all on function public.complete_sk_event(uuid, text) from public, anon;
grant execute on function public.complete_sk_event(uuid, text) to authenticated;

alter table public.community_notifications drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement', 'disaster_advisory', 'resident_profile_change', 'document_request',
    'community_feedback', 'meeting_update', 'health_outreach_cancellation',
    'health_outreach_completion', 'health_outreach_review', 'health_outreach_published',
    'health_outreach_review_submission', 'health_outreach_rescheduled',
    'sk_event_review_submission', 'sk_event_published', 'sk_event_review_feedback',
    'sk_event_cancelled', 'sk_event_rescheduled', 'sk_event_completed'
  ));

drop policy if exists community_notifications_sk_event_completed_read on public.community_notifications;
create policy community_notifications_sk_event_completed_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid()) and resource_type = 'sk_event_completed'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.sk_events event where event.id = community_notifications.resource_id
      and event.barangay_id = community_notifications.barangay_id and event.status = 'completed')
  );
drop policy if exists community_notifications_sk_event_completed_mark_read on public.community_notifications;
create policy community_notifications_sk_event_completed_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null and resource_type = 'sk_event_completed'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.sk_events event where event.id = community_notifications.resource_id
      and event.barangay_id = community_notifications.barangay_id and event.status = 'completed')
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null and resource_type = 'sk_event_completed'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.sk_events event where event.id = community_notifications.resource_id
      and event.barangay_id = community_notifications.barangay_id and event.status = 'completed')
  );

create or replace function public.list_my_completed_sk_event_notification_details(
  p_barangay_id uuid, p_event_ids uuid[]
) returns table (event_id uuid, title text, page_number integer)
language sql stable security invoker set search_path = '' as $$
  with ranked as (
    select event.id, event.title,
      ((row_number() over (order by event.starts_at, event.id) - 1) / 20)::integer as page_number
    from public.sk_events event
    where event.barangay_id = p_barangay_id and event.status = 'completed'
      and public.is_active_member(p_barangay_id)
  )
  select ranked.id, ranked.title, ranked.page_number from ranked
  where ranked.id = any(coalesce(p_event_ids, '{}'::uuid[]));
$$;
revoke all on function public.list_my_completed_sk_event_notification_details(uuid, uuid[]) from public, anon;
grant execute on function public.list_my_completed_sk_event_notification_details(uuid, uuid[]) to authenticated;

drop function if exists public.get_sk_event_notification_summary(uuid, uuid);
create function public.get_sk_event_notification_summary(p_barangay_id uuid, p_event_id uuid)
returns table (
  publication_sent bigint, publication_read bigint,
  schedule_update_sent bigint, schedule_update_read bigint,
  cancellation_sent bigint, cancellation_read bigint,
  completion_sent bigint, completion_read bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_event public.sk_events%rowtype;
begin
  if not public.is_active_member(p_barangay_id)
    or not public.has_tenant_permission(p_barangay_id, 'sk.event.manage') then
    raise exception 'not authorized';
  end if;
  select * into v_event from public.sk_events event
  where event.id = p_event_id and event.barangay_id = p_barangay_id;
  if not found then raise exception 'event not found'; end if;

  return query select
    count(*) filter (where notification.resource_type = 'sk_event_published')::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_published' and notification.read_at is not null)::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_rescheduled')::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_rescheduled' and notification.read_at is not null)::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_cancelled')::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_cancelled' and notification.read_at is not null)::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_completed')::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_completed' and notification.read_at is not null)::bigint
  from public.community_notifications notification
  where notification.barangay_id = p_barangay_id and notification.resource_id = p_event_id
    and ((notification.resource_type = 'sk_event_published' and v_event.status in ('published', 'completed', 'cancelled'))
      or (notification.resource_type = 'sk_event_rescheduled' and v_event.status in ('published', 'completed', 'cancelled'))
      or (notification.resource_type = 'sk_event_cancelled' and v_event.status = 'cancelled')
      or (notification.resource_type = 'sk_event_completed' and v_event.status = 'completed'));
end;
$$;
revoke all on function public.get_sk_event_notification_summary(uuid, uuid) from public, anon;
grant execute on function public.get_sk_event_notification_summary(uuid, uuid) to authenticated;
