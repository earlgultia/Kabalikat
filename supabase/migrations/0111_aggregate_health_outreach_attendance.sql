-- Record aggregate reach only; never create participant or patient rows.
alter table public.health_outreach_campaigns
  add column if not exists attendance_count integer;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.health_outreach_campaigns'::regclass
      and conname = 'health_outreach_attendance_count_check'
  ) then
    alter table public.health_outreach_campaigns
      add constraint health_outreach_attendance_count_check
      check (attendance_count is null or attendance_count between 0 and 1000000);
  end if;
end;
$$;

drop function if exists public.complete_health_outreach_campaign(uuid);
create or replace function public.complete_health_outreach_campaign(p_campaign_id uuid, p_attendance_count integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign public.health_outreach_campaigns%rowtype;
begin
  select * into v_campaign
  from public.health_outreach_campaigns
  where id = p_campaign_id
  for update;

  if not found or not public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.manage') then
    raise exception 'not authorized';
  end if;
  if v_campaign.status <> 'published' or v_campaign.ends_at > now() then
    raise exception 'campaign cannot be completed before its scheduled end';
  end if;
  if p_attendance_count is null or p_attendance_count < 0 or p_attendance_count > 1000000 then
    raise exception 'attendance count must be between 0 and 1000000';
  end if;

  update public.health_outreach_campaigns
  set status = 'completed', completed_at = now(), attendance_count = p_attendance_count
  where id = v_campaign.id;

  insert into public.health_outreach_events(barangay_id, campaign_id, actor_id, action, note)
  values (v_campaign.barangay_id, v_campaign.id, auth.uid(), 'campaign_completed',
    'Aggregate attendance count recorded: ' || p_attendance_count::text);
end;
$$;
revoke all on function public.complete_health_outreach_campaign(uuid, integer) from public, anon;
grant execute on function public.complete_health_outreach_campaign(uuid, integer) to authenticated;

drop function if exists public.list_health_outreach_campaign_page(uuid, integer, integer, text, text);
create function public.list_health_outreach_campaign_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  id uuid,
  barangay_id uuid,
  title text,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  created_by uuid,
  created_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  completed_at timestamptz,
  attendance_count integer,
  total_count bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'published', 'completed', 'cancelled') then
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
