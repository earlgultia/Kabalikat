-- Distinguish returned SK event proposals from rejected/cancelled records.
alter table public.sk_events drop constraint if exists sk_events_status_check;
update public.sk_events event
set status = 'changes_requested'
where event.status = 'cancelled'
  and exists (
    select 1 from public.sk_event_events activity
    where activity.event_id = event.id and activity.barangay_id = event.barangay_id
      and activity.action = 'event_rejected'
  );

alter table public.sk_events add constraint sk_events_status_check
  check (status in ('draft','changes_requested','published','completed','cancelled'));

alter table public.sk_event_events drop constraint if exists sk_event_events_action_check;
alter table public.sk_event_events add constraint sk_event_events_action_check
  check (action in ('event_created','event_published','event_rejected','event_completed','event_changes_requested','event_updated','event_resubmitted'));

-- Expand the summary to include returned proposals while preserving RLS.
drop function if exists public.get_sk_event_queue_summary(uuid, text, text);
create function public.get_sk_event_queue_summary(
  p_barangay_id uuid,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  total_count bigint,
  awaiting_review_count bigint,
  changes_requested_count bigint,
  published_count bigint,
  completed_count bigint,
  cancelled_count bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all','draft','changes_requested','published','completed','cancelled') then
    raise exception 'invalid SK event status filter';
  end if;
  return query
  select
    count(*) filter (where v_status = 'all' or event.status = v_status)::bigint,
    count(*) filter (where event.status = 'draft')::bigint,
    count(*) filter (where event.status = 'changes_requested')::bigint,
    count(*) filter (where event.status = 'published')::bigint,
    count(*) filter (where event.status = 'completed')::bigint,
    count(*) filter (where event.status = 'cancelled')::bigint
  from public.sk_events event
  where event.barangay_id = p_barangay_id
    and (v_search is null or position(v_search in lower(concat_ws(' ',event.title,event.description,event.location))) > 0);
end;
$$;
revoke all on function public.get_sk_event_queue_summary(uuid, text, text) from public, anon;
grant execute on function public.get_sk_event_queue_summary(uuid, text, text) to authenticated;

-- Keep the existing paged queue contract while adding the new status value.
create or replace function public.list_sk_event_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  id uuid, barangay_id uuid, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, status text, created_by uuid,
  created_at timestamptz, reviewed_by uuid, reviewed_at timestamptz,
  review_note text, completed_at timestamptz, total_count bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all','draft','changes_requested','published','completed','cancelled') then
    raise exception 'invalid SK event status filter';
  end if;
  return query
  with matching as (
    select event.id,event.barangay_id,event.title,event.description,event.location,
      event.starts_at,event.ends_at,event.status,event.created_by,event.created_at,
      event.reviewed_by,event.reviewed_at,event.review_note,event.completed_at
    from public.sk_events event
    where event.barangay_id = p_barangay_id
      and (v_status = 'all' or event.status = v_status)
      and (v_search is null or position(v_search in lower(concat_ws(' ',event.title,event.description,event.location))) > 0)
  ), counted as (
    select matching.*,count(*) over () as total_count from matching
  )
  select counted.id,counted.barangay_id,counted.title,counted.description,counted.location,
    counted.starts_at,counted.ends_at,counted.status,counted.created_by,counted.created_at,
    counted.reviewed_by,counted.reviewed_at,counted.review_note,counted.completed_at,counted.total_count
  from counted order by counted.starts_at,counted.id
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;
revoke all on function public.list_sk_event_page(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_sk_event_page(uuid, integer, integer, text, text) to authenticated;

create or replace function public.review_sk_event(p_event_id uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.sk_events%rowtype;
begin
  select * into v_event from public.sk_events where id = p_event_id for update;
  if not found or not public.has_tenant_permission(v_event.barangay_id,'sk.event.review') then
    raise exception 'not authorized';
  end if;
  if v_event.status not in ('draft','changes_requested') then
    raise exception 'event is no longer awaiting review';
  end if;
  if v_event.created_by = (select auth.uid()) then
    raise exception 'event creator cannot review their own event';
  end if;
  if not p_approve and length(trim(coalesce(p_note,''))) not between 3 and 1000 then
    raise exception 'a reason is required to request changes';
  end if;

  update public.sk_events set
    status = case when p_approve then 'published' else 'changes_requested' end,
    reviewed_by = (select auth.uid()), reviewed_at = now(),
    review_note = case when p_approve then null else trim(p_note) end
  where id = v_event.id;
  insert into public.sk_event_events(barangay_id,event_id,actor_id,action,note)
  values (v_event.barangay_id,v_event.id,(select auth.uid()),
    case when p_approve then 'event_published' else 'event_changes_requested' end,
    case when p_approve then '' else trim(p_note) end);

  if not p_approve then
    insert into public.community_notifications(barangay_id,recipient_id,resource_type,resource_id)
    values (v_event.barangay_id,v_event.created_by,'sk_event_review_feedback',v_event.id)
    on conflict (recipient_id,resource_type,resource_id)
    do update set created_at = excluded.created_at, read_at = null;
  end if;
end;
$$;
revoke all on function public.review_sk_event(uuid,boolean,text) from public, anon;
grant execute on function public.review_sk_event(uuid,boolean,text) to authenticated;

create or replace function public.update_sk_event(
  p_event_id uuid,p_title text,p_description text,p_location text,
  p_starts_at timestamptz,p_ends_at timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.sk_events%rowtype;
begin
  select * into v_event from public.sk_events where id = p_event_id for update;
  if not found or not public.has_tenant_permission(v_event.barangay_id,'sk.event.manage')
    or v_event.created_by is distinct from (select auth.uid()) then
    raise exception 'not authorized';
  end if;
  if v_event.status not in ('draft','changes_requested') then
    raise exception 'only draft or returned schedules can be edited';
  end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 180
    or length(coalesce(p_description,'')) > 2000
    or length(trim(coalesce(p_location,''))) not between 2 and 240
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid SK event details';
  end if;

  update public.sk_events set title = trim(p_title),description = trim(coalesce(p_description,'')),
    location = trim(p_location),starts_at = p_starts_at,ends_at = p_ends_at,
    status = 'draft',reviewed_by = null,reviewed_at = null,review_note = null
  where id = v_event.id;
  insert into public.sk_event_events(barangay_id,event_id,actor_id,action,note)
  values (v_event.barangay_id,v_event.id,(select auth.uid()),
    case when v_event.status = 'changes_requested' then 'event_resubmitted' else 'event_updated' end,
    trim(p_title));
end;
$$;
revoke all on function public.update_sk_event(uuid,text,text,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.update_sk_event(uuid,text,text,text,timestamptz,timestamptz) to authenticated;

-- Refresh a Captain's queue alert on resubmission; keep drafts reviewer-only.
create or replace function public.notify_sk_event_review_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'draft' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'changes_requested' then return new; end if;
  end if;
  insert into public.community_notifications(barangay_id,recipient_id,resource_type,resource_id)
  select new.barangay_id,membership.user_id,'sk_event_review_submission',new.id
  from public.barangay_memberships membership
  join public.permissions permission on permission.key = 'sk.event.review'
  left join public.role_permissions role_permission
    on role_permission.role_id = membership.role_id and role_permission.permission_id = permission.id
  left join public.membership_permissions member_permission
    on member_permission.membership_id = membership.id and member_permission.permission_id = permission.id
  where membership.barangay_id = new.barangay_id and membership.status = 'active'
    and membership.user_id is distinct from new.created_by
    and coalesce(member_permission.effect,case when role_permission.role_id is null then 'deny' else 'allow' end) = 'allow'
  on conflict (recipient_id,resource_type,resource_id)
  do update set created_at = excluded.created_at,read_at = null;
  return new;
end;
$$;
revoke all on function public.notify_sk_event_review_submission() from public, anon, authenticated;
drop trigger if exists sk_event_review_submission_notification on public.sk_events;
create trigger sk_event_review_submission_notification after insert or update on public.sk_events
  for each row execute function public.notify_sk_event_review_submission();

-- Only the proposal creator can read a private change-request notification.
alter table public.community_notifications drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement','disaster_advisory','resident_profile_change','document_request','community_feedback',
    'meeting_update','health_outreach_cancellation','health_outreach_completion','health_outreach_review',
    'health_outreach_published','health_outreach_review_submission','sk_event_review_submission',
    'sk_event_published','sk_event_review_feedback'
  ));

drop policy if exists community_notifications_sk_event_review_feedback_read on public.community_notifications;
create policy community_notifications_sk_event_review_feedback_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid()) and resource_type = 'sk_event_review_feedback'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id,'sk.event.manage')
    and exists (select 1 from public.sk_events event where event.id = community_notifications.resource_id
      and event.barangay_id = community_notifications.barangay_id
      and event.created_by = (select auth.uid()) and event.status = 'changes_requested')
  );
drop policy if exists community_notifications_sk_event_review_feedback_mark_read on public.community_notifications;
create policy community_notifications_sk_event_review_feedback_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null and resource_type = 'sk_event_review_feedback'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id,'sk.event.manage')
    and exists (select 1 from public.sk_events event where event.id = community_notifications.resource_id
      and event.barangay_id = community_notifications.barangay_id
      and event.created_by = (select auth.uid()) and event.status = 'changes_requested')
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null and resource_type = 'sk_event_review_feedback'
    and public.is_active_member(barangay_id)
    and public.has_tenant_permission(barangay_id,'sk.event.manage')
    and exists (select 1 from public.sk_events event where event.id = community_notifications.resource_id
      and event.barangay_id = community_notifications.barangay_id
      and event.created_by = (select auth.uid()) and event.status = 'changes_requested')
  );

create or replace function public.list_my_sk_event_review_feedback_details(p_barangay_id uuid,p_event_ids uuid[])
returns table (event_id uuid,title text,review_note text,page_number integer)
language sql stable security invoker set search_path = '' as $$
  with ranked_events as (
    select event.id,event.title,event.review_note,
      ((row_number() over (order by event.starts_at,event.id) - 1) / 20)::integer as page_number
    from public.sk_events event
    where event.barangay_id = p_barangay_id and event.status = 'changes_requested'
      and event.created_by = (select auth.uid())
      and public.has_tenant_permission(p_barangay_id,'sk.event.manage')
  )
  select event.id,event.title,event.review_note,event.page_number
  from ranked_events event where event.id = any(coalesce(p_event_ids,'{}'::uuid[]));
$$;
revoke all on function public.list_my_sk_event_review_feedback_details(uuid,uuid[]) from public, anon;
grant execute on function public.list_my_sk_event_review_feedback_details(uuid,uuid[]) to authenticated;
