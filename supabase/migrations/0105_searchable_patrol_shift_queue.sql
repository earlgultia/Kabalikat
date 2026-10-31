-- Search and filter patrol schedules while preserving caller RLS.
create index if not exists patrol_shifts_tenant_status_schedule_search_idx
  on public.patrol_shifts(barangay_id, status, starts_at desc, id desc);

create or replace function public.list_patrol_shifts_filtered_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 50,
  p_search text default null,
  p_status text default 'all'
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
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'scheduled', 'active', 'completed', 'cancelled') then
    raise exception 'invalid patrol shift status filter';
  end if;

  return query
  with matching as (
    select shift.id, shift.title, shift.patrol_area, shift.starts_at, shift.ends_at, shift.status,
      shift.assigned_to, shift.started_at, shift.completed_at, shift.cancellation_note, shift.created_at
    from public.patrol_shifts shift
    where shift.barangay_id = p_barangay_id
      and (v_status = 'all' or shift.status = v_status)
      and (v_search is null or position(v_search in lower(concat_ws(' ', shift.title, shift.patrol_area))) > 0)
  ), counted as (
    select matching.*, count(*) over () as total_count
    from matching
  )
  select counted.id, counted.title, counted.patrol_area, counted.starts_at, counted.ends_at,
    counted.status, counted.assigned_to, counted.started_at, counted.completed_at,
    counted.cancellation_note, counted.created_at, counted.total_count
  from counted
  order by case counted.status when 'active' then 0 when 'scheduled' then 1 when 'completed' then 2 else 3 end,
    counted.starts_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_patrol_shifts_filtered_page(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_patrol_shifts_filtered_page(uuid, integer, integer, text, text) to authenticated;
