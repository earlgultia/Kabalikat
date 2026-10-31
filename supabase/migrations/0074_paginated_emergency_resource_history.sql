-- Load emergency-resource audit history only on demand and one resource at a time.
create index if not exists disaster_emergency_resource_events_page_idx
  on public.disaster_emergency_resource_events(barangay_id, resource_id, created_at desc, id desc);

create or replace function public.list_disaster_emergency_resource_activity_page(
  p_barangay_id uuid,
  p_resource_id uuid,
  p_page integer default 0
)
returns table (
  resource_id uuid,
  resource_name text,
  action text,
  actor_name text,
  note text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 1000000);
begin
  if not public.has_tenant_permission(p_barangay_id, 'disaster.manage') then
    raise exception 'not authorized';
  end if;
  if not exists (
    select 1 from public.disaster_emergency_resources r
    where r.id = p_resource_id and r.barangay_id = p_barangay_id
  ) then
    raise exception 'not authorized';
  end if;

  return query
    select e.resource_id, r.name::text, e.action,
      coalesce(nullif(p.display_name, ''), 'Workspace member')::text,
      e.note, e.created_at, count(*) over ()
    from public.disaster_emergency_resource_events e
    join public.disaster_emergency_resources r
      on r.id = e.resource_id and r.barangay_id = e.barangay_id
    left join public.profiles p on p.id = e.actor_id
    where e.barangay_id = p_barangay_id and e.resource_id = p_resource_id
    order by e.created_at desc, e.id desc
    limit 25 offset (v_page::bigint * 25);
end;
$$;

revoke all on function public.list_disaster_emergency_resource_activity_page(uuid, uuid, integer) from public, anon;
grant execute on function public.list_disaster_emergency_resource_activity_page(uuid, uuid, integer) to authenticated;
