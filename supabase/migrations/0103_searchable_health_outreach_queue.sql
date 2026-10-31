-- Search and filter health outreach schedules while preserving caller RLS.
create index if not exists health_outreach_tenant_status_schedule_page_idx
  on public.health_outreach_campaigns(barangay_id, status, starts_at, id);

create or replace function public.list_health_outreach_campaign_page(
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
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
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
      campaign.reviewed_by, campaign.reviewed_at, campaign.review_note, campaign.completed_at
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
    counted.reviewed_by, counted.reviewed_at, counted.review_note, counted.completed_at, counted.total_count
  from counted
  order by counted.starts_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_health_outreach_campaign_page(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_health_outreach_campaign_page(uuid, integer, integer, text, text) to authenticated;
