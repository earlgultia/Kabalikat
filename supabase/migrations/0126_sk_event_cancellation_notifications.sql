-- Let SK staff cancel a published schedule with an audited reason.
alter table public.sk_event_events drop constraint if exists sk_event_events_action_check;
alter table public.sk_event_events add constraint sk_event_events_action_check
  check (action in (
    'event_created','event_published','event_rejected','event_completed',
    'event_changes_requested','event_updated','event_resubmitted','event_cancelled'
  ));

drop policy if exists sk_events_read on public.sk_events;
create policy sk_events_read on public.sk_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'sk.event.manage')
    or public.has_tenant_permission(barangay_id,'sk.event.review')
    or (public.is_active_member(barangay_id) and status in ('published','completed','cancelled')));

create or replace function public.cancel_sk_event(p_event_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.sk_events%rowtype;
begin
  select * into v_event from public.sk_events where id = p_event_id for update;
  if not found or not public.has_tenant_permission(v_event.barangay_id,'sk.event.manage') then
    raise exception 'not authorized';
  end if;
  if v_event.status <> 'published' or v_event.ends_at <= now() then
    raise exception 'only an upcoming or in-progress event can be cancelled';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then
    raise exception 'a cancellation reason is required';
  end if;

  update public.sk_events set status = 'cancelled', review_note = trim(p_reason)
  where id = v_event.id;
  insert into public.sk_event_events(barangay_id,event_id,actor_id,action,note)
  values (v_event.barangay_id,v_event.id,(select auth.uid()),'event_cancelled',trim(p_reason));
end;
$$;
revoke all on function public.cancel_sk_event(uuid,text) from public,anon;
grant execute on function public.cancel_sk_event(uuid,text) to authenticated;

alter table public.community_notifications drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement','disaster_advisory','resident_profile_change','document_request',
    'community_feedback','meeting_update','health_outreach_cancellation','health_outreach_completion',
    'health_outreach_review','health_outreach_published','health_outreach_review_submission',
    'sk_event_review_submission','sk_event_published','sk_event_review_feedback','sk_event_cancelled'
  ));

drop policy if exists community_notifications_sk_event_cancelled_read on public.community_notifications;
create policy community_notifications_sk_event_cancelled_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid()) and resource_type = 'sk_event_cancelled'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.sk_events event
      where event.id = community_notifications.resource_id
        and event.barangay_id = community_notifications.barangay_id and event.status = 'cancelled')
  );

drop policy if exists community_notifications_sk_event_cancelled_mark_read on public.community_notifications;
create policy community_notifications_sk_event_cancelled_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null and resource_type = 'sk_event_cancelled'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.sk_events event
      where event.id = community_notifications.resource_id
        and event.barangay_id = community_notifications.barangay_id and event.status = 'cancelled')
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null and resource_type = 'sk_event_cancelled'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.sk_events event
      where event.id = community_notifications.resource_id
        and event.barangay_id = community_notifications.barangay_id and event.status = 'cancelled')
  );

create or replace function public.notify_cancelled_sk_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then return new; end if;
  insert into public.community_notifications(barangay_id,recipient_id,resource_type,resource_id)
  select new.barangay_id,membership.user_id,'sk_event_cancelled',new.id
  from public.barangay_memberships membership
  where membership.barangay_id = new.barangay_id and membership.status = 'active'
    and membership.user_id is distinct from (select auth.uid())
    and not exists (select 1 from public.community_notification_preferences preference
      where preference.user_id = membership.user_id and preference.barangay_id = new.barangay_id
        and preference.resource_type = 'sk_event_update' and preference.enabled = false)
  on conflict (recipient_id,resource_type,resource_id)
    do update set created_at = excluded.created_at,read_at = null;
  return new;
end;
$$;
revoke all on function public.notify_cancelled_sk_event() from public,anon,authenticated;
drop trigger if exists sk_event_cancellation_notification on public.sk_events;
create trigger sk_event_cancellation_notification after update on public.sk_events
  for each row execute function public.notify_cancelled_sk_event();

create or replace function public.list_my_cancelled_sk_event_notification_details(
  p_barangay_id uuid,p_event_ids uuid[]
)
returns table (event_id uuid,title text,cancellation_reason text,page_number integer)
language sql stable security invoker set search_path = '' as $$
  with ranked_events as (
    select event.id,event.title,event.review_note,
      ((row_number() over (order by event.starts_at,event.id) - 1) / 20)::integer as page_number
    from public.sk_events event
    where event.barangay_id = p_barangay_id and event.status = 'cancelled'
      and public.is_active_member(p_barangay_id)
  )
  select event.id,event.title,event.review_note,event.page_number
  from ranked_events event where event.id = any(coalesce(p_event_ids,'{}'::uuid[]));
$$;
revoke all on function public.list_my_cancelled_sk_event_notification_details(uuid,uuid[]) from public,anon;
grant execute on function public.list_my_cancelled_sk_event_notification_details(uuid,uuid[]) to authenticated;
