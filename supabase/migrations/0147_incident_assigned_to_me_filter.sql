-- Add an assignee-only queue filter without changing the caller's row-level visibility.
create or replace function public.list_incident_reports_page_assigned_filter(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_search text default null,
  p_status text default 'all',
  p_category text default 'all',
  p_severity text default 'all',
  p_assigned_to_me boolean default false,
  p_created_after timestamptz default null,
  p_created_before timestamptz default null
)
returns table (
  id uuid,
  category text,
  severity text,
  location text,
  summary text,
  details text,
  status text,
  resolution_note text,
  created_by uuid,
  managed_by uuid,
  assigned_to uuid,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_status text := coalesce(nullif(p_status, ''), 'all');
  v_category text := coalesce(nullif(p_category, ''), 'all');
  v_severity text := coalesce(nullif(p_severity, ''), 'all');
begin
  if v_status not in ('all', 'submitted', 'acknowledged', 'in_progress', 'resolved', 'closed') then
    raise exception 'invalid incident status filter';
  end if;
  if v_category not in ('all', 'safety', 'hazard', 'disturbance', 'property', 'disaster', 'other') then
    raise exception 'invalid incident category filter';
  end if;
  if v_severity not in ('all', 'low', 'moderate', 'high', 'urgent') then
    raise exception 'invalid incident severity filter';
  end if;
  if p_created_after is not null and p_created_before is not null and p_created_after >= p_created_before then
    raise exception 'invalid incident creation date range';
  end if;

  return query
  with matching as (
    select i.id, i.category, i.severity, i.location, i.summary, i.details, i.status,
      i.resolution_note, i.created_by, i.managed_by, i.assigned_to, i.created_at
    from public.incidents i
    where i.barangay_id = p_barangay_id
      and (v_status = 'all' or i.status = v_status)
      and (v_category = 'all' or i.category = v_category)
      and (v_severity = 'all' or i.severity = v_severity)
      and (not coalesce(p_assigned_to_me, false) or i.assigned_to = (select auth.uid()))
      and (v_search is null or position(v_search in lower(concat_ws(' ', i.summary, i.location, i.details))) > 0)
      and (p_created_after is null or i.created_at >= p_created_after)
      and (p_created_before is null or i.created_at < p_created_before)
  ), counted as (
    select matching.*, count(*) over () as total_count
    from matching
  )
  select counted.id, counted.category, counted.severity, counted.location, counted.summary,
    counted.details, counted.status, counted.resolution_note, counted.created_by, counted.managed_by,
    counted.assigned_to, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_incident_reports_page_assigned_filter(uuid, integer, integer, text, text, text, text, boolean, timestamptz, timestamptz) from public, anon;
grant execute on function public.list_incident_reports_page_assigned_filter(uuid, integer, integer, text, text, text, text, boolean, timestamptz, timestamptz) to authenticated;
