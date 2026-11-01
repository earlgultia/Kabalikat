-- Add bounded, server-filtered patrol history while preserving shift-log RLS.
create index if not exists patrol_shift_logs_filtered_history_idx
  on public.patrol_shift_logs(barangay_id, shift_id, entry_type, created_at desc, id desc);

create or replace function public.list_patrol_shift_log_page(
  p_barangay_id uuid,
  p_shift_id uuid,
  p_page integer default 0,
  p_page_size integer default 50,
  p_entry_type text default 'all',
  p_from date default null,
  p_to date default null
)
returns table (
  id uuid,
  shift_id uuid,
  entry_type text,
  location_note text,
  details text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_entry_type text := coalesce(nullif(p_entry_type, ''), 'all');
begin
  if p_barangay_id is null or p_shift_id is null then
    raise exception 'a barangay and shift are required';
  end if;
  if v_entry_type not in ('all', 'shift_started', 'checkpoint', 'observation', 'shift_completed', 'shift_cancelled', 'shift_rescheduled') then
    raise exception 'invalid patrol log type filter';
  end if;
  if p_from is not null and p_to is not null and (p_to < p_from or p_to > p_from + 365) then
    raise exception 'patrol history date range must be valid and no longer than 366 days';
  end if;

  return query
  with filtered as (
    select log.id, log.shift_id, log.entry_type, log.location_note, log.details, log.created_at
    from public.patrol_shift_logs log
    where log.barangay_id = p_barangay_id
      and log.shift_id = p_shift_id
      and (v_entry_type = 'all' or log.entry_type = v_entry_type)
      and (p_from is null or log.created_at >= (p_from::timestamp at time zone 'UTC'))
      and (p_to is null or log.created_at < ((p_to + 1)::timestamp at time zone 'UTC'))
  ), counted as (
    select filtered.*, count(*) over () as total_count from filtered
  )
  select counted.id, counted.shift_id, counted.entry_type::text,
    counted.location_note, counted.details, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_patrol_shift_log_page(uuid, uuid, integer, integer, text, date, date) from public, anon;
grant execute on function public.list_patrol_shift_log_page(uuid, uuid, integer, integer, text, date, date) to authenticated;
