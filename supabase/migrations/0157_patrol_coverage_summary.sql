-- Provide a privacy-preserving, Captain-only patrol coverage summary for a date range.
create or replace function public.get_patrol_coverage_summary(p_barangay_id uuid, p_from date, p_to date)
returns table (
  total_shifts bigint,
  scheduled_shifts bigint,
  active_shifts bigint,
  completed_shifts bigint,
  cancelled_shifts bigint,
  checkpoint_entries bigint,
  observation_entries bigint,
  handover_summaries bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_barangay_id is null or not public.has_tenant_permission(p_barangay_id, 'patrol.manage') then
    raise exception 'not authorized';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + 365 then
    raise exception 'choose a valid patrol summary date range no longer than 366 days';
  end if;

  return query
  with shifts as (
    select shift.id, shift.status
    from public.patrol_shifts shift
    where shift.barangay_id = p_barangay_id
      and shift.starts_at >= (p_from::timestamp at time zone 'UTC')
      and shift.starts_at < ((p_to + 1)::timestamp at time zone 'UTC')
  ), logs as (
    select log.entry_type
    from public.patrol_shift_logs log
    where log.barangay_id = p_barangay_id
      and log.created_at >= (p_from::timestamp at time zone 'UTC')
      and log.created_at < ((p_to + 1)::timestamp at time zone 'UTC')
  )
  select
    (select count(*) from shifts),
    (select count(*) from shifts where status = 'scheduled'),
    (select count(*) from shifts where status = 'active'),
    (select count(*) from shifts where status = 'completed'),
    (select count(*) from shifts where status = 'cancelled'),
    (select count(*) from logs where entry_type = 'checkpoint'),
    (select count(*) from logs where entry_type = 'observation'),
    (select count(*) from logs where entry_type = 'shift_completed');
end;
$$;

revoke all on function public.get_patrol_coverage_summary(uuid, date, date) from public, anon;
grant execute on function public.get_patrol_coverage_summary(uuid, date, date) to authenticated;
