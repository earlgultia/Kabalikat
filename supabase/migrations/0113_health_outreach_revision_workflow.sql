-- Keep returned outreach proposals editable and resubmittable by their creator.
alter table public.health_outreach_campaigns
  drop constraint if exists health_outreach_campaigns_status_check;
alter table public.health_outreach_campaigns
  add constraint health_outreach_campaigns_status_check
  check (status in ('draft', 'changes_requested', 'published', 'completed', 'cancelled'));

-- Before this revision workflow, rejection was represented as cancellation.
update public.health_outreach_campaigns campaign
set status = 'changes_requested'
where campaign.status = 'cancelled'
  and exists (
    select 1 from public.health_outreach_events event
    where event.campaign_id = campaign.id
      and event.barangay_id = campaign.barangay_id
      and event.action = 'campaign_rejected'
  );

alter table public.health_outreach_events
  drop constraint if exists health_outreach_events_action_check;
alter table public.health_outreach_events
  add constraint health_outreach_events_action_check
  check (action in ('campaign_created', 'campaign_published', 'campaign_rejected', 'campaign_completed', 'campaign_updated', 'campaign_resubmitted'));

create or replace function public.review_health_outreach_campaign(p_campaign_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign public.health_outreach_campaigns%rowtype;
begin
  select * into v_campaign
  from public.health_outreach_campaigns
  where id = p_campaign_id
  for update;
  if not found or not public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.review') then
    raise exception 'not authorized';
  end if;
  if v_campaign.status not in ('draft', 'changes_requested') then
    raise exception 'campaign is no longer awaiting review';
  end if;
  if p_approve and v_campaign.created_by = auth.uid() then
    raise exception 'campaign creator cannot approve their own campaign';
  end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) not between 3 and 1000 then
    raise exception 'a reason is required to request changes';
  end if;

  update public.health_outreach_campaigns
  set status = case when p_approve then 'published' else 'changes_requested' end,
    reviewed_by = auth.uid(), reviewed_at = now(),
    review_note = case when p_approve then null else trim(p_note) end
  where id = v_campaign.id;

  insert into public.health_outreach_events(barangay_id, campaign_id, actor_id, action, note)
  values (v_campaign.barangay_id, v_campaign.id, auth.uid(),
    case when p_approve then 'campaign_published' else 'campaign_rejected' end,
    case when p_approve then '' else trim(p_note) end);
end;
$$;
revoke all on function public.review_health_outreach_campaign(uuid, boolean, text) from public, anon;
grant execute on function public.review_health_outreach_campaign(uuid, boolean, text) to authenticated;

create or replace function public.update_health_outreach_campaign(
  p_campaign_id uuid,
  p_title text,
  p_description text,
  p_location text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign public.health_outreach_campaigns%rowtype;
begin
  select * into v_campaign
  from public.health_outreach_campaigns
  where id = p_campaign_id
  for update;
  if not found
    or not public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.manage')
    or v_campaign.created_by is distinct from auth.uid() then
    raise exception 'not authorized';
  end if;
  if v_campaign.status not in ('draft', 'changes_requested') then
    raise exception 'only draft or returned schedules can be edited';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 3 and 180
    or length(coalesce(p_description, '')) > 2000
    or length(trim(coalesce(p_location, ''))) not between 2 and 240
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid outreach campaign details';
  end if;

  update public.health_outreach_campaigns
  set title = trim(p_title), description = trim(coalesce(p_description, '')),
    location = trim(p_location), starts_at = p_starts_at, ends_at = p_ends_at,
    status = 'draft', reviewed_by = null, reviewed_at = null, review_note = null
  where id = v_campaign.id;

  insert into public.health_outreach_events(barangay_id, campaign_id, actor_id, action, note)
  values (v_campaign.barangay_id, v_campaign.id, auth.uid(),
    case when v_campaign.status = 'changes_requested' then 'campaign_resubmitted' else 'campaign_updated' end,
    trim(p_title));
end;
$$;
revoke all on function public.update_health_outreach_campaign(uuid, text, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.update_health_outreach_campaign(uuid, text, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.list_health_outreach_campaign_page(
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
  review_note text, completed_at timestamptz, attendance_count integer, total_count bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'changes_requested', 'published', 'completed', 'cancelled') then
    raise exception 'invalid health outreach status filter';
  end if;
  return query
  with matching as (
    select campaign.id, campaign.barangay_id, campaign.title, campaign.description, campaign.location,
      campaign.starts_at, campaign.ends_at, campaign.status, campaign.created_by, campaign.created_at,
      campaign.reviewed_by, campaign.reviewed_at, campaign.review_note, campaign.completed_at,
      campaign.attendance_count
    from public.health_outreach_campaigns campaign
    where campaign.barangay_id = p_barangay_id
      and (v_status = 'all' or campaign.status = v_status)
      and (v_search is null or position(v_search in lower(concat_ws(' ', campaign.title, campaign.description, campaign.location))) > 0)
  ), counted as (
    select matching.*, count(*) over () as total_count
    from matching
  )
  select counted.id, counted.barangay_id, counted.title, counted.description, counted.location,
    counted.starts_at, counted.ends_at, counted.status, counted.created_by, counted.created_at,
    counted.reviewed_by, counted.reviewed_at, counted.review_note, counted.completed_at,
    counted.attendance_count, counted.total_count
  from counted
  order by counted.starts_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;
revoke all on function public.list_health_outreach_campaign_page(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_health_outreach_campaign_page(uuid, integer, integer, text, text) to authenticated;

create or replace function public.get_health_outreach_campaign_summary(
  p_barangay_id uuid, p_search text default null, p_status text default 'all'
)
returns table (total_count bigint, completed_count bigint, total_attendance bigint)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'changes_requested', 'published', 'completed', 'cancelled') then
    raise exception 'invalid health outreach status filter';
  end if;
  return query
  select count(*)::bigint,
    count(*) filter (where campaign.status = 'completed')::bigint,
    coalesce(sum(campaign.attendance_count), 0)::bigint
  from public.health_outreach_campaigns campaign
  where campaign.barangay_id = p_barangay_id
    and (v_status = 'all' or campaign.status = v_status)
    and (v_search is null or position(v_search in lower(concat_ws(' ', campaign.title, campaign.description, campaign.location))) > 0);
end;
$$;
revoke all on function public.get_health_outreach_campaign_summary(uuid, text, text) from public, anon;
grant execute on function public.get_health_outreach_campaign_summary(uuid, text, text) to authenticated;
