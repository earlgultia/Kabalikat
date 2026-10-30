-- Keep active and upcoming patrol shifts ahead of older shift history while paging.
create index if not exists patrol_shifts_tenant_status_page_idx
  on public.patrol_shifts(
    barangay_id,
    (case status when 'active' then 0 when 'scheduled' then 1 when 'completed' then 2 else 3 end),
    starts_at desc,
    id desc
  );

create or replace function public.list_patrol_shifts_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 50
)
returns table (
  id uuid,
  title text,
  patrol_area text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  assigned_to uuid,
  started_at timestamptz,
  completed_at timestamptz,
  cancellation_note text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
begin
  return query
  with counted as (
    select s.id, s.title, s.patrol_area, s.starts_at, s.ends_at, s.status, s.assigned_to,
      s.started_at, s.completed_at, s.cancellation_note, s.created_at,
      count(*) over () as total_count
    from public.patrol_shifts s
    where s.barangay_id = p_barangay_id
  )
  select counted.id, counted.title, counted.patrol_area, counted.starts_at, counted.ends_at,
    counted.status, counted.assigned_to, counted.started_at, counted.completed_at,
    counted.cancellation_note, counted.created_at, counted.total_count
  from counted
  order by case counted.status when 'active' then 0 when 'scheduled' then 1 when 'completed' then 2 else 3 end,
    counted.starts_at desc, counted.id desc
  offset v_page * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_patrol_shifts_page(uuid, integer, integer) from public, anon;
grant execute on function public.list_patrol_shifts_page(uuid, integer, integer) to authenticated;
