-- Support a single, searchable upcoming-events page across SK and health schedules.
create index if not exists sk_events_published_calendar_page_idx
  on public.sk_events(barangay_id, status, starts_at, id);

create index if not exists health_outreach_published_calendar_page_idx
  on public.health_outreach_campaigns(barangay_id, status, starts_at, id);

create or replace function public.list_community_calendar_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_search text default null,
  p_source text default 'all'
)
returns table (
  id uuid,
  title text,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  source text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_source text := coalesce(nullif(p_source, ''), 'all');
begin
  if v_source not in ('all', 'sk', 'health') then
    raise exception 'invalid community calendar source';
  end if;

  return query
  with upcoming as (
    select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at, 'sk'::text as source
    from public.sk_events e
    where e.barangay_id = p_barangay_id
      and e.status = 'published'
      and e.ends_at >= now()
      and (v_source in ('all', 'sk'))
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', e.title, e.location, e.description))) > 0)
    union all
    select h.id, h.title, h.description, h.location, h.starts_at, h.ends_at, 'health'::text as source
    from public.health_outreach_campaigns h
    where h.barangay_id = p_barangay_id
      and h.status = 'published'
      and h.ends_at >= now()
      and (v_source in ('all', 'health'))
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', h.title, h.location, h.description))) > 0)
  ), counted as (
    select upcoming.*, count(*) over () as total_count
    from upcoming
  )
  select counted.id, counted.title, counted.description, counted.location, counted.starts_at,
    counted.ends_at, counted.source, counted.total_count
  from counted
  order by counted.starts_at, counted.id, counted.source
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_community_calendar_page(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_community_calendar_page(uuid, integer, integer, text, text) to authenticated;
