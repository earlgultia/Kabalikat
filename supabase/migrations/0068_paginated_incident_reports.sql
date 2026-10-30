-- Search and page only incidents visible under the caller's existing row-level policies.
create index if not exists incidents_tenant_created_page_idx
  on public.incidents(barangay_id, created_at desc, id desc);

create or replace function public.list_incident_reports_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_search text default null,
  p_status text default 'all',
  p_category text default 'all'
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
begin
  if v_status not in ('all', 'submitted', 'acknowledged', 'in_progress', 'resolved', 'closed') then
    raise exception 'invalid incident status filter';
  end if;
  if v_category not in ('all', 'safety', 'hazard', 'disturbance', 'property', 'disaster', 'other') then
    raise exception 'invalid incident category filter';
  end if;

  return query
  with matching as (
    select i.id, i.category, i.severity, i.location, i.summary, i.details, i.status,
      i.resolution_note, i.created_by, i.managed_by, i.assigned_to, i.created_at
    from public.incidents i
    where i.barangay_id = p_barangay_id
      and (v_status = 'all' or i.status = v_status)
      and (v_category = 'all' or i.category = v_category)
      and (v_search is null or position(v_search in lower(concat_ws(' ', i.summary, i.location, i.details))) > 0)
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

revoke all on function public.list_incident_reports_page(uuid, integer, integer, text, text, text) from public, anon;
grant execute on function public.list_incident_reports_page(uuid, integer, integer, text, text, text) to authenticated;

-- Preserve owner-only incident status history while limiting the query to visible page IDs.
create or replace function public.get_own_incident_status_events(p_barangay_id uuid, p_incident_ids uuid[])
returns table (incident_id uuid, action text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_permission(p_barangay_id, 'incident.report') then
    raise exception 'not authorized';
  end if;
  if coalesce(cardinality(p_incident_ids), 0) > 100 then
    raise exception 'too many incident IDs';
  end if;

  return query
  select e.incident_id, e.action, e.created_at
  from public.incident_events e
  join public.incidents i on i.id = e.incident_id and i.barangay_id = e.barangay_id
  where e.barangay_id = p_barangay_id
    and i.barangay_id = p_barangay_id
    and i.created_by = auth.uid()
    and e.action in ('submitted', 'acknowledged', 'started', 'resolved', 'closed', 'escalated')
    and e.incident_id = any(coalesce(p_incident_ids, array[]::uuid[]))
  order by e.created_at asc, e.id asc;
end;
$$;

revoke all on function public.get_own_incident_status_events(uuid, uuid[]) from public, anon;
grant execute on function public.get_own_incident_status_events(uuid, uuid[]) to authenticated;
