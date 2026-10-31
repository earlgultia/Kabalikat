-- Notify active Captain reviewers when an SK event schedule is submitted.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement','disaster_advisory','resident_profile_change','document_request',
    'community_feedback','meeting_update','health_outreach_cancellation',
    'health_outreach_completion','health_outreach_review','health_outreach_published',
    'health_outreach_review_submission','sk_event_review_submission'
  ));

drop policy if exists community_notifications_sk_event_submission_read on public.community_notifications;
create policy community_notifications_sk_event_submission_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and resource_type = 'sk_event_review_submission'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'sk.event.review')
    and exists (
      select 1 from public.sk_events event
      where event.id = community_notifications.resource_id
        and event.barangay_id = community_notifications.barangay_id
        and event.status = 'draft'
    )
  );

drop policy if exists community_notifications_sk_event_submission_mark_read on public.community_notifications;
create policy community_notifications_sk_event_submission_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null
    and resource_type = 'sk_event_review_submission'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'sk.event.review')
    and exists (
      select 1 from public.sk_events event
      where event.id = community_notifications.resource_id
        and event.barangay_id = community_notifications.barangay_id
        and event.status = 'draft'
    )
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null
    and resource_type = 'sk_event_review_submission'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id, 'sk.event.review')
    and exists (
      select 1 from public.sk_events event
      where event.id = community_notifications.resource_id
        and event.barangay_id = community_notifications.barangay_id
        and event.status = 'draft'
    )
  );

create or replace function public.notify_sk_event_review_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'draft' then
    return new;
  end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select new.barangay_id, membership.user_id, 'sk_event_review_submission', new.id
  from public.barangay_memberships membership
  join public.permissions permission on permission.key = 'sk.event.review'
  left join public.role_permissions role_permission
    on role_permission.role_id = membership.role_id and role_permission.permission_id = permission.id
  left join public.membership_permissions member_permission
    on member_permission.membership_id = membership.id and member_permission.permission_id = permission.id
  where membership.barangay_id = new.barangay_id
    and membership.status = 'active'
    and membership.user_id is distinct from new.created_by
    and coalesce(member_permission.effect, case when role_permission.role_id is null then 'deny' else 'allow' end) = 'allow'
  on conflict (recipient_id, resource_type, resource_id)
  do update set created_at = excluded.created_at, read_at = null;

  return new;
end;
$$;
revoke all on function public.notify_sk_event_review_submission() from public, anon, authenticated;

drop trigger if exists sk_event_review_submission_notification on public.sk_events;
create trigger sk_event_review_submission_notification
  after insert on public.sk_events
  for each row execute function public.notify_sk_event_review_submission();

create or replace function public.list_my_sk_event_review_submission_details(
  p_barangay_id uuid,
  p_event_ids uuid[]
)
returns table (event_id uuid, title text, page_number integer)
language sql stable security invoker set search_path = '' as $$
  with ranked_events as (
    select event.id, event.title,
      ((row_number() over (order by event.starts_at, event.id) - 1) / 20)::integer as page_number
    from public.sk_events event
    where event.barangay_id = p_barangay_id and event.status = 'draft'
      and public.has_tenant_permission(p_barangay_id, 'sk.event.review')
  )
  select event.id, event.title, event.page_number
  from ranked_events event
  where event.id = any(coalesce(p_event_ids, '{}'::uuid[]));
$$;
revoke all on function public.list_my_sk_event_review_submission_details(uuid, uuid[]) from public, anon;
grant execute on function public.list_my_sk_event_review_submission_details(uuid, uuid[]) to authenticated;
