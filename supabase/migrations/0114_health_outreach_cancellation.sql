-- Allow audited cancellation of a published outreach while retaining its public notice.
alter table public.health_outreach_campaigns
  add column if not exists cancellation_reason text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.health_outreach_campaigns'::regclass
      and conname = 'health_outreach_cancellation_reason_check'
  ) then
    alter table public.health_outreach_campaigns
      add constraint health_outreach_cancellation_reason_check
      check (cancellation_reason is null or length(cancellation_reason) between 3 and 1000);
  end if;
end;
$$;

create or replace function public.cancel_health_outreach_campaign(p_campaign_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign public.health_outreach_campaigns%rowtype;
begin
  select * into v_campaign
  from public.health_outreach_campaigns
  where id = p_campaign_id
  for update;

  if not found or not (
    public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.manage')
    or public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.review')
  ) then
    raise exception 'not authorized';
  end if;
  if v_campaign.status <> 'published' or v_campaign.ends_at <= now() then
    raise exception 'only upcoming or in-progress published schedules can be cancelled';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'a cancellation reason is required';
  end if;

  update public.health_outreach_campaigns
  set status = 'cancelled', cancellation_reason = trim(p_reason)
  where id = v_campaign.id;

  insert into public.health_outreach_events(barangay_id, campaign_id, actor_id, action, note)
  values (v_campaign.barangay_id, v_campaign.id, auth.uid(), 'campaign_cancelled', trim(p_reason));
end;
$$;
revoke all on function public.cancel_health_outreach_campaign(uuid, text) from public, anon;
grant execute on function public.cancel_health_outreach_campaign(uuid, text) to authenticated;

alter table public.health_outreach_events
  drop constraint if exists health_outreach_events_action_check;
alter table public.health_outreach_events
  add constraint health_outreach_events_action_check
  check (action in ('campaign_created', 'campaign_published', 'campaign_rejected', 'campaign_completed', 'campaign_updated', 'campaign_resubmitted', 'campaign_cancelled'));

drop policy if exists health_outreach_campaigns_read on public.health_outreach_campaigns;
create policy health_outreach_campaigns_read on public.health_outreach_campaigns for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'health.campaign.manage')
    or public.has_tenant_permission(barangay_id, 'health.campaign.review')
    or (public.is_active_member(barangay_id) and status in ('published', 'completed', 'cancelled')));

drop function if exists public.list_health_outreach_campaign_page(uuid, integer, integer, text, text);
create function public.list_health_outreach_campaign_page(
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
  review_note text, completed_at timestamptz, attendance_count integer,
  cancellation_reason text, total_count bigint
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
      campaign.attendance_count, campaign.cancellation_reason
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
    counted.attendance_count, counted.cancellation_reason, counted.total_count
  from counted
  order by counted.starts_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;
revoke all on function public.list_health_outreach_campaign_page(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_health_outreach_campaign_page(uuid, integer, integer, text, text) to authenticated;
