-- Deliver member-facing notices for approved SK events, with an account preference.
alter table public.community_notification_preferences
  drop constraint if exists community_notification_preferences_resource_type_check;
alter table public.community_notification_preferences
  add constraint community_notification_preferences_resource_type_check
  check (resource_type in ('announcement','disaster_advisory','meeting_update','health_outreach_update','sk_event_update'));

alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement','disaster_advisory','resident_profile_change','document_request',
    'community_feedback','meeting_update','health_outreach_cancellation',
    'health_outreach_completion','health_outreach_review','health_outreach_published',
    'health_outreach_review_submission','sk_event_review_submission','sk_event_published'
  ));

drop policy if exists community_notifications_sk_event_published_read on public.community_notifications;
create policy community_notifications_sk_event_published_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and resource_type = 'sk_event_published'
    and public.is_active_member(barangay_id)
    and exists (
      select 1 from public.sk_events event
      where event.id = community_notifications.resource_id
        and event.barangay_id = community_notifications.barangay_id
        and event.status in ('published','completed')
    )
  );

drop policy if exists community_notifications_sk_event_published_mark_read on public.community_notifications;
create policy community_notifications_sk_event_published_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null
    and resource_type = 'sk_event_published'
    and public.is_active_member(barangay_id)
    and exists (
      select 1 from public.sk_events event
      where event.id = community_notifications.resource_id
        and event.barangay_id = community_notifications.barangay_id
        and event.status in ('published','completed')
    )
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null
    and resource_type = 'sk_event_published'
    and public.is_active_member(barangay_id)
    and exists (
      select 1 from public.sk_events event
      where event.id = community_notifications.resource_id
        and event.barangay_id = community_notifications.barangay_id
        and event.status in ('published','completed')
    )
  );

create or replace function public.notify_published_sk_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'published' or old.status = 'published' then
    return new;
  end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select new.barangay_id, membership.user_id, 'sk_event_published', new.id
  from public.barangay_memberships membership
  where membership.barangay_id = new.barangay_id
    and membership.status = 'active'
    and membership.user_id is distinct from new.reviewed_by
    and not exists (
      select 1 from public.community_notification_preferences preference
      where preference.user_id = membership.user_id
        and preference.barangay_id = new.barangay_id
        and preference.resource_type = 'sk_event_update'
        and preference.enabled = false
    )
  on conflict (recipient_id, resource_type, resource_id) do nothing;

  return new;
end;
$$;
revoke all on function public.notify_published_sk_event() from public, anon, authenticated;

drop trigger if exists sk_event_publication_notification on public.sk_events;
create trigger sk_event_publication_notification
  after update on public.sk_events
  for each row execute function public.notify_published_sk_event();

create or replace function public.list_my_published_sk_event_notification_details(
  p_barangay_id uuid,
  p_event_ids uuid[]
)
returns table (event_id uuid, title text, status text, page_number integer)
language sql stable security invoker set search_path = '' as $$
  with ranked_events as (
    select event.id, event.title, event.status,
      ((row_number() over (partition by event.status order by event.starts_at, event.id) - 1) / 20)::integer as page_number
    from public.sk_events event
    where event.barangay_id = p_barangay_id
      and event.status in ('published','completed')
      and public.is_active_member(p_barangay_id)
  )
  select event.id, event.title, event.status, event.page_number
  from ranked_events event
  where event.id = any(coalesce(p_event_ids, '{}'::uuid[]));
$$;
revoke all on function public.list_my_published_sk_event_notification_details(uuid, uuid[]) from public, anon;
grant execute on function public.list_my_published_sk_event_notification_details(uuid, uuid[]) to authenticated;
