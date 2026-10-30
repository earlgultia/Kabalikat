-- Load incident histories on demand in bounded pages.
create or replace function public.get_own_incident_status_events_page(
  p_barangay_id uuid,
  p_incident_id uuid,
  p_page integer default 0,
  p_page_size integer default 50
)
returns table (id uuid, incident_id uuid, action text, created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
begin
  if not public.has_tenant_permission(p_barangay_id, 'incident.report') then
    raise exception 'not authorized';
  end if;

  return query
  with counted as (
    select e.id, e.incident_id, e.action, e.created_at, count(*) over () as total_count
    from public.incident_events e
    join public.incidents i on i.id = e.incident_id and i.barangay_id = e.barangay_id
    where e.barangay_id = p_barangay_id
      and i.barangay_id = p_barangay_id
      and i.id = p_incident_id
      and i.created_by = auth.uid()
      and e.action in ('submitted', 'acknowledged', 'started', 'resolved', 'closed', 'escalated')
  )
  select counted.id, counted.incident_id, counted.action, counted.created_at, counted.total_count
  from counted
  order by counted.created_at, counted.id
  offset v_page * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.get_own_incident_status_events_page(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.get_own_incident_status_events_page(uuid, uuid, integer, integer) to authenticated;
