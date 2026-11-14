-- Use the database clock for Tanod's upcoming shift queue so it matches the
-- dashboard follow-up count, including when a device clock is inaccurate.
create or replace function public.list_upcoming_patrol_shifts_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 50,
  p_assigned_to uuid default null
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
  with matching as (
    select shift.id, shift.title, shift.patrol_area, shift.starts_at, shift.ends_at,
      shift.status, shift.assigned_to, shift.started_at, shift.completed_at,
      shift.cancellation_note, shift.created_at
    from public.patrol_shifts shift
    where shift.barangay_id = p_barangay_id
      and shift.status = 'scheduled'
      and shift.starts_at >= now()
      and (p_assigned_to is null or shift.assigned_to = p_assigned_to)
  ), counted as (
    select matching.*, count(*) over () as total_count
    from matching
  )
  select counted.id, counted.title, counted.patrol_area, counted.starts_at,
    counted.ends_at, counted.status, counted.assigned_to, counted.started_at,
    counted.completed_at, counted.cancellation_note, counted.created_at,
    counted.total_count
  from counted
  order by counted.starts_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_upcoming_patrol_shifts_page(uuid, integer, integer, uuid) from public, anon;
grant execute on function public.list_upcoming_patrol_shifts_page(uuid, integer, integer, uuid) to authenticated;
