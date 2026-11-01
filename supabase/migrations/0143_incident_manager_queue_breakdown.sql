-- Return aggregate-only status and category counts to incident managers.
create or replace function public.get_incident_queue_breakdown(
  p_barangay_id uuid,
  p_created_after timestamptz default null,
  p_created_before timestamptz default null
)
returns table (
  metric_type text,
  metric_value text,
  report_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.has_tenant_permission(p_barangay_id, 'incident.manage') then
    raise exception 'not authorized';
  end if;
  if p_created_after is not null and p_created_before is not null and p_created_after >= p_created_before then
    raise exception 'invalid incident creation date range';
  end if;

  return query
  with scoped as (
    select i.status::text as status_value, i.category::text as category_value
    from public.incidents i
    where i.barangay_id = p_barangay_id
      and (p_created_after is null or i.created_at >= p_created_after)
      and (p_created_before is null or i.created_at < p_created_before)
  ), dimensions as (
    select 'status'::text as kind, status_value as value from (values
      ('submitted'::text), ('acknowledged'::text), ('in_progress'::text), ('resolved'::text), ('closed'::text)
    ) status_values(status_value)
    union all
    select 'category'::text, category_value from (values
      ('safety'::text), ('hazard'::text), ('disturbance'::text), ('property'::text), ('disaster'::text), ('other'::text)
    ) category_values(category_value)
  )
  select d.kind, d.value, count(s.status_value)::bigint
  from dimensions d
  left join scoped s on (d.kind = 'status' and s.status_value = d.value)
    or (d.kind = 'category' and s.category_value = d.value)
  group by d.kind, d.value
  order by d.kind, d.value;
end;
$$;

revoke all on function public.get_incident_queue_breakdown(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_incident_queue_breakdown(uuid, timestamptz, timestamptz) to authenticated;
