-- Preserve schedule changes as visible snapshots and notify opted-in members.
create table public.sk_event_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  event_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 3 and 1000),
  previous_location text not null,
  previous_starts_at timestamptz not null,
  previous_ends_at timestamptz not null,
  new_location text not null,
  new_starts_at timestamptz not null,
  new_ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (event_id,barangay_id) references public.sk_events(id,barangay_id) on delete restrict,
  check (length(trim(previous_location)) between 2 and 240),
  check (length(trim(new_location)) between 2 and 240),
  check (previous_ends_at > previous_starts_at),
  check (new_ends_at > new_starts_at)
);
create index sk_event_schedule_changes_latest_idx
  on public.sk_event_schedule_changes(barangay_id,event_id,created_at desc,id desc);

alter table public.sk_event_schedule_changes enable row level security;
create policy sk_event_schedule_changes_read on public.sk_event_schedule_changes
  for select to authenticated using (
    public.is_active_member(barangay_id)
    and exists (select 1 from public.sk_events event where event.id = sk_event_schedule_changes.event_id
      and event.barangay_id = sk_event_schedule_changes.barangay_id
      and event.status in ('published','completed','cancelled'))
  );
revoke all on public.sk_event_schedule_changes from anon,authenticated;
grant select on public.sk_event_schedule_changes to authenticated;

alter table public.sk_event_events drop constraint if exists sk_event_events_action_check;
alter table public.sk_event_events add constraint sk_event_events_action_check
  check (action in (
    'event_created','event_published','event_rejected','event_completed',
    'event_changes_requested','event_updated','event_resubmitted','event_cancelled','event_rescheduled'
  ));

create or replace function public.reschedule_sk_event(
  p_event_id uuid,p_new_location text,p_new_starts_at timestamptz,
  p_new_ends_at timestamptz,p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.sk_events%rowtype;
begin
  select * into v_event from public.sk_events where id = p_event_id for update;
  if not found or not public.has_tenant_permission(v_event.barangay_id,'sk.event.manage') then
    raise exception 'not authorized';
  end if;
  if v_event.status <> 'published' or v_event.ends_at <= now() then
    raise exception 'only an upcoming or in-progress event can be rescheduled';
  end if;
  if length(trim(coalesce(p_new_location,''))) not between 2 and 240
    or p_new_starts_at is null or p_new_starts_at <= now()
    or p_new_ends_at is null or p_new_ends_at <= p_new_starts_at
    or length(trim(coalesce(p_reason,''))) not between 3 and 1000 then
    raise exception 'provide a future schedule, location, and reason';
  end if;

  insert into public.sk_event_schedule_changes(
    barangay_id,event_id,actor_id,reason,previous_location,previous_starts_at,
    previous_ends_at,new_location,new_starts_at,new_ends_at
  ) values (
    v_event.barangay_id,v_event.id,(select auth.uid()),trim(p_reason),v_event.location,
    v_event.starts_at,v_event.ends_at,trim(p_new_location),p_new_starts_at,p_new_ends_at
  );
  update public.sk_events set location = trim(p_new_location),starts_at = p_new_starts_at,ends_at = p_new_ends_at
    where id = v_event.id;
  insert into public.sk_event_events(barangay_id,event_id,actor_id,action,note)
  values (v_event.barangay_id,v_event.id,(select auth.uid()),'event_rescheduled',trim(p_reason));

  insert into public.community_notifications(barangay_id,recipient_id,resource_type,resource_id)
  select v_event.barangay_id,membership.user_id,'sk_event_rescheduled',v_event.id
  from public.barangay_memberships membership
  where membership.barangay_id = v_event.barangay_id and membership.status = 'active'
    and membership.user_id is distinct from (select auth.uid())
    and not exists (select 1 from public.community_notification_preferences preference
      where preference.user_id = membership.user_id and preference.barangay_id = v_event.barangay_id
        and preference.resource_type = 'sk_event_update' and preference.enabled = false)
  on conflict (recipient_id,resource_type,resource_id)
    do update set created_at = excluded.created_at,read_at = null;
end;
$$;
revoke all on function public.reschedule_sk_event(uuid,text,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.reschedule_sk_event(uuid,text,timestamptz,timestamptz,text) to authenticated;

alter table public.community_notifications drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement','disaster_advisory','resident_profile_change','document_request',
    'community_feedback','meeting_update','health_outreach_cancellation','health_outreach_completion',
    'health_outreach_review','health_outreach_published','health_outreach_review_submission',
    'sk_event_review_submission','sk_event_published','sk_event_review_feedback',
    'sk_event_cancelled','sk_event_rescheduled'
  ));

drop policy if exists community_notifications_sk_event_rescheduled_read on public.community_notifications;
create policy community_notifications_sk_event_rescheduled_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid()) and resource_type = 'sk_event_rescheduled'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.sk_event_schedule_changes change
      where change.event_id = community_notifications.resource_id
        and change.barangay_id = community_notifications.barangay_id)
  );

drop policy if exists community_notifications_sk_event_rescheduled_mark_read on public.community_notifications;
create policy community_notifications_sk_event_rescheduled_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null and resource_type = 'sk_event_rescheduled'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.sk_event_schedule_changes change
      where change.event_id = community_notifications.resource_id
        and change.barangay_id = community_notifications.barangay_id)
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null and resource_type = 'sk_event_rescheduled'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.sk_event_schedule_changes change
      where change.event_id = community_notifications.resource_id
        and change.barangay_id = community_notifications.barangay_id)
  );

create or replace function public.list_my_rescheduled_sk_event_notification_details(
  p_barangay_id uuid,p_event_ids uuid[]
)
returns table (
  event_id uuid,title text,status text,location text,starts_at timestamptz,ends_at timestamptz,
  previous_location text,previous_starts_at timestamptz,previous_ends_at timestamptz,
  reason text,page_number integer
)
language sql stable security invoker set search_path = '' as $$
  with latest_change as (
    select distinct on (change.event_id) change.event_id,change.barangay_id,change.new_location,
      change.new_starts_at,change.new_ends_at,change.previous_location,change.previous_starts_at,
      change.previous_ends_at,change.reason
    from public.sk_event_schedule_changes change
    where change.barangay_id = p_barangay_id
    order by change.event_id,change.created_at desc,change.id desc
  ), ranked_events as (
    select event.id,event.title,event.status,change.new_location,change.new_starts_at,change.new_ends_at,
      change.previous_location,change.previous_starts_at,change.previous_ends_at,change.reason,
      ((row_number() over (order by event.starts_at,event.id) - 1) / 20)::integer as page_number
    from latest_change change
    join public.sk_events event on event.id = change.event_id and event.barangay_id = change.barangay_id
    where event.barangay_id = p_barangay_id and event.status in ('published','completed','cancelled')
      and public.is_active_member(p_barangay_id)
  )
  select event.id,event.title,event.status,event.new_location,event.new_starts_at,event.new_ends_at,
    event.previous_location,event.previous_starts_at,event.previous_ends_at,event.reason,event.page_number
  from ranked_events event
  where event.id = any(coalesce(p_event_ids,'{}'::uuid[]));
$$;
revoke all on function public.list_my_rescheduled_sk_event_notification_details(uuid,uuid[]) from public,anon;
grant execute on function public.list_my_rescheduled_sk_event_notification_details(uuid,uuid[]) to authenticated;
