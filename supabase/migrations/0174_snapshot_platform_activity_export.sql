-- Export audit rows against one fixed upper-bound snapshot using keyset paging.
create or replace function public.list_platform_activity_export_page(
  p_page_size integer default 100,
  p_event_type text default 'all',
  p_search text default null,
  p_created_after timestamptz default null,
  p_created_before timestamptz default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_snapshot_created_at timestamptz default null,
  p_snapshot_id uuid default null
)
returns table (
  id uuid,
  barangay_id uuid,
  barangay_name text,
  actor_name text,
  event_type text,
  summary text,
  created_at timestamptz,
  total_count bigint,
  snapshot_created_at timestamptz,
  snapshot_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page_size integer := least(greatest(coalesce(p_page_size, 100), 1), 100);
  v_event_type text := coalesce(nullif(p_event_type, ''), 'all');
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_snapshot_created_at timestamptz := p_snapshot_created_at;
  v_snapshot_id uuid := p_snapshot_id;
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if v_event_type not in ('all', 'barangay_onboarded', 'subscription_created', 'subscription_updated', 'subscription_plan_updated') then
    raise exception 'invalid platform activity filter';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null)
    or (v_snapshot_created_at is null) <> (v_snapshot_id is null) then
    raise exception 'activity export cursor is incomplete';
  end if;
  if p_created_after is not null and p_created_before is not null and p_created_before <= p_created_after then
    raise exception 'activity end date must be after its start date';
  end if;

  if v_snapshot_created_at is null then
    select event.created_at, event.id
      into v_snapshot_created_at, v_snapshot_id
    from public.platform_activity_events event
    order by event.created_at desc, event.id desc
    limit 1;
  end if;
  if v_snapshot_created_at is null then
    return;
  end if;

  return query
  with filtered as (
    select event.id, event.barangay_id, barangay.name as barangay_name,
      event.actor_name, event.event_type, event.summary, event.created_at
    from public.platform_activity_events event
    left join public.barangays barangay on barangay.id = event.barangay_id
    where (event.created_at, event.id) <= (v_snapshot_created_at, v_snapshot_id)
      and (v_event_type = 'all' or event.event_type = v_event_type)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ',
        coalesce(barangay.name, ''), event.summary, event.actor_name
      ))) > 0)
      and (p_created_after is null or event.created_at >= p_created_after)
      and (p_created_before is null or event.created_at < p_created_before)
  ), counted as (
    select filtered.*, count(*) over () as total_count from filtered
  )
  select counted.id, counted.barangay_id, counted.barangay_name,
    counted.actor_name, counted.event_type, counted.summary, counted.created_at,
    counted.total_count, v_snapshot_created_at, v_snapshot_id
  from counted
  where p_cursor_created_at is null
    or (counted.created_at, counted.id) < (p_cursor_created_at, p_cursor_id)
  order by counted.created_at desc, counted.id desc
  limit v_page_size;
end;
$$;

revoke all on function public.list_platform_activity_export_page(integer, text, text, timestamptz, timestamptz, timestamptz, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.list_platform_activity_export_page(integer, text, text, timestamptz, timestamptz, timestamptz, uuid, timestamptz, uuid) to authenticated;
