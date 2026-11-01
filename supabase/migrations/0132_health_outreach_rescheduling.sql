-- Keep published health outreach logistics changes visible and notify opted-in members.
create table public.health_outreach_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  campaign_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 3 and 1000),
  previous_location text not null check (length(trim(previous_location)) between 2 and 240),
  previous_starts_at timestamptz not null,
  previous_ends_at timestamptz not null,
  new_location text not null check (length(trim(new_location)) between 2 and 240),
  new_starts_at timestamptz not null,
  new_ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, barangay_id)
    references public.health_outreach_campaigns(id, barangay_id) on delete restrict,
  check (previous_ends_at > previous_starts_at),
  check (new_ends_at > new_starts_at)
);
create index health_outreach_schedule_changes_latest_idx
  on public.health_outreach_schedule_changes(barangay_id, campaign_id, created_at desc, id desc);

alter table public.health_outreach_schedule_changes enable row level security;
create policy health_outreach_schedule_changes_read on public.health_outreach_schedule_changes
  for select to authenticated using (
    public.is_active_member(barangay_id)
    and exists (
      select 1 from public.health_outreach_campaigns campaign
      where campaign.id = health_outreach_schedule_changes.campaign_id
        and campaign.barangay_id = health_outreach_schedule_changes.barangay_id
        and campaign.status in ('published', 'completed', 'cancelled')
    )
  );
revoke all on public.health_outreach_schedule_changes from anon, authenticated;
grant select (
  id, barangay_id, campaign_id, reason, previous_location, previous_starts_at,
  previous_ends_at, new_location, new_starts_at, new_ends_at, created_at
) on public.health_outreach_schedule_changes to authenticated;

alter table public.health_outreach_events drop constraint if exists health_outreach_events_action_check;
alter table public.health_outreach_events add constraint health_outreach_events_action_check
  check (action in (
    'campaign_created', 'campaign_published', 'campaign_rejected', 'campaign_completed',
    'campaign_updated', 'campaign_resubmitted', 'campaign_cancelled', 'campaign_rescheduled'
  ));

create or replace function public.reschedule_health_outreach_campaign(
  p_campaign_id uuid, p_new_location text, p_new_starts_at timestamptz,
  p_new_ends_at timestamptz, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign public.health_outreach_campaigns%rowtype;
begin
  select * into v_campaign from public.health_outreach_campaigns where id = p_campaign_id for update;
  if not found or not (
    public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.manage')
    or public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.review')
  ) then raise exception 'not authorized'; end if;
  if v_campaign.status <> 'published' or v_campaign.ends_at <= now() then
    raise exception 'only an upcoming or in-progress schedule can be rescheduled';
  end if;
  if length(trim(coalesce(p_new_location, ''))) not between 2 and 240
    or p_new_starts_at is null or p_new_starts_at <= now()
    or p_new_ends_at is null or p_new_ends_at <= p_new_starts_at
    or length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'provide a future schedule, location, and reason';
  end if;

  insert into public.health_outreach_schedule_changes (
    barangay_id, campaign_id, actor_id, reason, previous_location, previous_starts_at,
    previous_ends_at, new_location, new_starts_at, new_ends_at
  ) values (
    v_campaign.barangay_id, v_campaign.id, (select auth.uid()), trim(p_reason),
    v_campaign.location, v_campaign.starts_at, v_campaign.ends_at,
    trim(p_new_location), p_new_starts_at, p_new_ends_at
  );
  update public.health_outreach_campaigns
    set location = trim(p_new_location), starts_at = p_new_starts_at, ends_at = p_new_ends_at
    where id = v_campaign.id;
  insert into public.health_outreach_events(barangay_id, campaign_id, actor_id, action, note)
    values (v_campaign.barangay_id, v_campaign.id, (select auth.uid()), 'campaign_rescheduled', trim(p_reason));

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select v_campaign.barangay_id, membership.user_id, 'health_outreach_rescheduled', v_campaign.id
  from public.barangay_memberships membership
  where membership.barangay_id = v_campaign.barangay_id and membership.status = 'active'
    and membership.user_id is distinct from (select auth.uid())
    and not exists (
      select 1 from public.community_notification_preferences preference
      where preference.user_id = membership.user_id and preference.barangay_id = v_campaign.barangay_id
        and preference.resource_type = 'health_outreach_update' and preference.enabled = false
    )
  on conflict (recipient_id, resource_type, resource_id)
    do update set created_at = excluded.created_at, read_at = null;
end;
$$;
revoke all on function public.reschedule_health_outreach_campaign(uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.reschedule_health_outreach_campaign(uuid, text, timestamptz, timestamptz, text) to authenticated;

alter table public.community_notifications drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement', 'disaster_advisory', 'resident_profile_change', 'document_request',
    'community_feedback', 'meeting_update', 'health_outreach_cancellation',
    'health_outreach_completion', 'health_outreach_review', 'health_outreach_published',
    'health_outreach_review_submission', 'health_outreach_rescheduled',
    'sk_event_review_submission', 'sk_event_published', 'sk_event_review_feedback',
    'sk_event_cancelled', 'sk_event_rescheduled'
  ));

drop policy if exists community_notifications_health_rescheduled_read on public.community_notifications;
create policy community_notifications_health_rescheduled_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid()) and resource_type = 'health_outreach_rescheduled'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.health_outreach_schedule_changes change
      where change.campaign_id = community_notifications.resource_id
        and change.barangay_id = community_notifications.barangay_id)
  );
drop policy if exists community_notifications_health_rescheduled_mark_read on public.community_notifications;
create policy community_notifications_health_rescheduled_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null and resource_type = 'health_outreach_rescheduled'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.health_outreach_schedule_changes change
      where change.campaign_id = community_notifications.resource_id
        and change.barangay_id = community_notifications.barangay_id)
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null and resource_type = 'health_outreach_rescheduled'
    and public.is_active_member(barangay_id)
    and exists (select 1 from public.health_outreach_schedule_changes change
      where change.campaign_id = community_notifications.resource_id
        and change.barangay_id = community_notifications.barangay_id)
  );

create or replace function public.can_access_community_notification(
  p_resource_type text, p_resource_id uuid, p_barangay_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_member(p_barangay_id) and case p_resource_type
    when 'announcement' then exists (
      select 1 from public.announcements a where a.id = p_resource_id and a.barangay_id = p_barangay_id
        and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
        and case a.audience
          when 'public' then true
          when 'officials' then public.has_tenant_permission(p_barangay_id, 'announcement.officials.read')
          when 'residents' then exists (select 1 from public.barangay_memberships m
            join public.role_definitions r on r.id = m.role_id and r.key = 'resident'
            where m.user_id = (select auth.uid()) and m.barangay_id = p_barangay_id and m.status = 'active')
          when 'role' then exists (select 1 from public.barangay_memberships m
            join public.role_definitions r on r.id = m.role_id and r.scope = 'barangay'
            where m.user_id = (select auth.uid()) and m.barangay_id = p_barangay_id
              and m.status = 'active' and m.role_id = a.audience_role_id)
          else false
        end
    )
    when 'disaster_advisory' then exists (select 1 from public.disaster_advisories a
      where a.id = p_resource_id and a.barangay_id = p_barangay_id and a.status = 'published'
        and (a.expires_at is null or a.expires_at > now())
        and public.has_tenant_permission(p_barangay_id, 'disaster.read'))
    when 'resident_profile_change' then exists (select 1 from public.resident_profile_change_requests r
      where r.id = p_resource_id and r.barangay_id = p_barangay_id and r.requested_by = (select auth.uid())
        and r.status in ('approved', 'rejected'))
    when 'document_request' then exists (select 1 from public.document_requests d
      join public.residents r on r.id = d.resident_id and r.barangay_id = d.barangay_id
      where d.id = p_resource_id and d.barangay_id = p_barangay_id and r.user_id = (select auth.uid()))
    when 'community_feedback' then exists (select 1 from public.community_feedback f
      where f.id = p_resource_id and f.barangay_id = p_barangay_id and f.submitted_by = (select auth.uid())
        and (f.status = 'closed' or (f.status = 'responded' and f.staff_response is not null)))
    when 'meeting_update' then exists (select 1 from public.meeting_update_events e
      join public.meeting_attendees a on a.meeting_id = e.meeting_id and a.barangay_id = e.barangay_id
      where e.id = p_resource_id and e.barangay_id = p_barangay_id and a.user_id = (select auth.uid()))
    when 'health_outreach_cancellation' then exists (select 1 from public.health_outreach_campaigns c
      where c.id = p_resource_id and c.barangay_id = p_barangay_id and c.status = 'cancelled')
    when 'health_outreach_completion' then exists (select 1 from public.health_outreach_campaigns c
      where c.id = p_resource_id and c.barangay_id = p_barangay_id and c.status = 'completed')
    when 'health_outreach_review' then exists (select 1 from public.health_outreach_events e
      join public.health_outreach_campaigns c on c.id = e.campaign_id and c.barangay_id = e.barangay_id
      where e.id = p_resource_id and e.barangay_id = p_barangay_id and e.action = 'campaign_rejected'
        and c.created_by = (select auth.uid()) and public.has_tenant_permission(p_barangay_id, 'health.campaign.manage'))
    when 'health_outreach_published' then exists (select 1 from public.health_outreach_campaigns c
      where c.id = p_resource_id and c.barangay_id = p_barangay_id and c.status in ('published', 'completed', 'cancelled'))
    when 'health_outreach_review_submission' then exists (select 1 from public.health_outreach_campaigns c
      where c.id = p_resource_id and c.barangay_id = p_barangay_id and c.status in ('draft', 'changes_requested')
        and public.has_tenant_permission(p_barangay_id, 'health.campaign.review'))
    when 'health_outreach_rescheduled' then exists (select 1 from public.health_outreach_schedule_changes change
      join public.health_outreach_campaigns c on c.id = change.campaign_id and c.barangay_id = change.barangay_id
      where change.campaign_id = p_resource_id and change.barangay_id = p_barangay_id
        and c.status in ('published', 'completed', 'cancelled'))
    when 'sk_event_review_submission' then exists (select 1 from public.sk_events e
      where e.id = p_resource_id and e.barangay_id = p_barangay_id and e.status in ('draft', 'changes_requested')
        and public.has_tenant_permission(p_barangay_id, 'sk.event.review'))
    when 'sk_event_published' then exists (select 1 from public.sk_events e
      where e.id = p_resource_id and e.barangay_id = p_barangay_id and e.status in ('published', 'completed'))
    when 'sk_event_review_feedback' then exists (select 1 from public.sk_event_events activity
      join public.sk_events e on e.id = activity.event_id and e.barangay_id = activity.barangay_id
      where activity.id = p_resource_id and activity.barangay_id = p_barangay_id
        and activity.action = 'event_changes_requested' and e.created_by = (select auth.uid())
        and public.has_tenant_permission(p_barangay_id, 'sk.event.manage'))
    when 'sk_event_cancelled' then exists (select 1 from public.sk_events e
      where e.id = p_resource_id and e.barangay_id = p_barangay_id and e.status = 'cancelled')
    when 'sk_event_rescheduled' then exists (select 1 from public.sk_event_schedule_changes change
      join public.sk_events e on e.id = change.event_id and e.barangay_id = change.barangay_id
      where change.event_id = p_resource_id and change.barangay_id = p_barangay_id
        and e.status in ('published', 'completed', 'cancelled'))
    else false
  end;
$$;
revoke all on function public.can_access_community_notification(text, uuid, uuid) from public, anon;
grant execute on function public.can_access_community_notification(text, uuid, uuid) to authenticated;

create or replace function public.list_my_rescheduled_health_outreach_notification_details(
  p_barangay_id uuid, p_campaign_ids uuid[]
) returns table (
  campaign_id uuid, title text, status text, new_location text,
  new_starts_at timestamptz, new_ends_at timestamptz, previous_location text,
  previous_starts_at timestamptz, previous_ends_at timestamptz, reason text, page_number integer
) language sql stable security invoker set search_path = '' as $$
  with latest_change as (
    select distinct on (change.campaign_id) change.campaign_id, change.barangay_id,
      change.new_location, change.new_starts_at, change.new_ends_at, change.previous_location,
      change.previous_starts_at, change.previous_ends_at, change.reason
    from public.health_outreach_schedule_changes change where change.barangay_id = p_barangay_id
    order by change.campaign_id, change.created_at desc, change.id desc
  ), ranked as (
    select campaign.id, campaign.title, campaign.status, change.new_location, change.new_starts_at,
      change.new_ends_at, change.previous_location, change.previous_starts_at, change.previous_ends_at,
      change.reason, ((row_number() over (partition by campaign.status order by campaign.starts_at, campaign.id) - 1) / 20)::integer as page_number
    from latest_change change join public.health_outreach_campaigns campaign
      on campaign.id = change.campaign_id and campaign.barangay_id = change.barangay_id
    where campaign.barangay_id = p_barangay_id and campaign.status in ('published', 'completed', 'cancelled')
      and public.is_active_member(p_barangay_id)
  )
  select ranked.id, ranked.title, ranked.status, ranked.new_location, ranked.new_starts_at,
    ranked.new_ends_at, ranked.previous_location, ranked.previous_starts_at, ranked.previous_ends_at,
    ranked.reason, ranked.page_number from ranked
  where ranked.id = any(coalesce(p_campaign_ids, '{}'::uuid[]));
$$;
revoke all on function public.list_my_rescheduled_health_outreach_notification_details(uuid, uuid[]) from public, anon;
grant execute on function public.list_my_rescheduled_health_outreach_notification_details(uuid, uuid[]) to authenticated;

create or replace function public.list_health_outreach_schedule_change_history(
  p_barangay_id uuid, p_campaign_id uuid, p_page integer default 0, p_page_size integer default 10
) returns table (
  id uuid, reason text, previous_location text, previous_starts_at timestamptz,
  previous_ends_at timestamptz, new_location text, new_starts_at timestamptz,
  new_ends_at timestamptz, created_at timestamptz, total_count bigint
) language plpgsql stable security invoker set search_path = '' as $$
declare v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
begin
  if not public.is_active_member(p_barangay_id) then raise exception 'not authorized'; end if;
  return query with history as (
    select change.id, change.reason, change.previous_location, change.previous_starts_at,
      change.previous_ends_at, change.new_location, change.new_starts_at, change.new_ends_at,
      change.created_at, count(*) over () as total_count
    from public.health_outreach_schedule_changes change
    join public.health_outreach_campaigns campaign
      on campaign.id = change.campaign_id and campaign.barangay_id = change.barangay_id
    where change.barangay_id = p_barangay_id and change.campaign_id = p_campaign_id
      and campaign.status in ('published', 'completed', 'cancelled')
  ) select history.id, history.reason, history.previous_location, history.previous_starts_at,
      history.previous_ends_at, history.new_location, history.new_starts_at, history.new_ends_at,
      history.created_at, history.total_count
    from history order by history.created_at desc, history.id desc
    offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;
revoke all on function public.list_health_outreach_schedule_change_history(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.list_health_outreach_schedule_change_history(uuid, uuid, integer, integer) to authenticated;
