-- Bound document-type configuration history reads and retain the manager permission check.
drop function public.list_document_type_activity(uuid);

create function public.list_document_type_activity_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 25
)
returns table (
  activity_id uuid,
  document_type_id uuid,
  document_type_name text,
  action text,
  actor_name text,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if not public.has_tenant_permission(p_barangay_id, 'document.type.manage') then
    raise exception 'not authorized';
  end if;

  return query
  with activity as (
    select e.id as activity_id, e.document_type_id, t.name as document_type_name, e.action,
      coalesce(nullif(p.display_name, ''), 'Workspace member') as actor_name,
      e.previous_values, e.new_values, e.created_at
    from public.document_type_events e
    join public.document_types t on t.id = e.document_type_id and t.barangay_id = e.barangay_id
    left join public.profiles p on p.id = e.actor_id
    where e.barangay_id = p_barangay_id
  ), counted as (
    select activity.*, count(*) over () as total_count from activity
  )
  select counted.activity_id, counted.document_type_id, counted.document_type_name, counted.action,
    counted.actor_name, counted.previous_values, counted.new_values, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.activity_id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

create index if not exists document_type_events_tenant_page_idx
  on public.document_type_events(barangay_id, created_at desc, id desc);

revoke all on function public.list_document_type_activity_page(uuid, integer, integer) from public, anon;
grant execute on function public.list_document_type_activity_page(uuid, integer, integer) to authenticated;
