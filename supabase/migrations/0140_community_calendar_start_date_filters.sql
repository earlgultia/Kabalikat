-- Apply start-date windows before paging the combined published community calendar.
create or replace function public.list_community_calendar_page_in_window(
  p_barangay_id uuid, p_page integer, p_page_size integer, p_search text, p_source text,
  p_starts_after timestamptz, p_starts_before timestamptz
) returns table (
  id uuid, title text, description text, location text, starts_at timestamptz,
  ends_at timestamptz, source text, total_count bigint
) language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_source text := coalesce(nullif(p_source, ''), 'all');
begin
  if v_source not in ('all', 'sk', 'health') then
    raise exception 'invalid community calendar source';
  end if;
  if p_starts_after is not null and p_starts_before is not null and p_starts_before <= p_starts_after then
    raise exception 'end of date range must be after its start';
  end if;

  return query
  with upcoming as (
    select event.id, event.title, event.description, event.location, event.starts_at, event.ends_at, 'sk'::text as source
    from public.sk_events event
    where event.barangay_id = p_barangay_id and event.status = 'published' and event.ends_at >= now()
      and (v_source in ('all', 'sk'))
      and (p_starts_after is null or event.starts_at >= p_starts_after)
      and (p_starts_before is null or event.starts_at < p_starts_before)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', event.title, event.location, event.description))) > 0)
    union all
    select campaign.id, campaign.title, campaign.description, campaign.location, campaign.starts_at, campaign.ends_at, 'health'::text as source
    from public.health_outreach_campaigns campaign
    where campaign.barangay_id = p_barangay_id and campaign.status = 'published' and campaign.ends_at >= now()
      and (v_source in ('all', 'health'))
      and (p_starts_after is null or campaign.starts_at >= p_starts_after)
      and (p_starts_before is null or campaign.starts_at < p_starts_before)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', campaign.title, campaign.location, campaign.description))) > 0)
  ), counted as (
    select upcoming.*, count(*) over () as total_count from upcoming
  )
  select counted.id, counted.title, counted.description, counted.location, counted.starts_at,
    counted.ends_at, counted.source, counted.total_count
  from counted order by counted.starts_at, counted.id, counted.source
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;
revoke all on function public.list_community_calendar_page_in_window(uuid, integer, integer, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.list_community_calendar_page_in_window(uuid, integer, integer, text, text, timestamptz, timestamptz) to authenticated;
