-- Search and filter SK schedules while preserving caller RLS.
create index if not exists sk_events_tenant_status_schedule_page_idx
  on public.sk_events(barangay_id, status, starts_at, id);

create or replace function public.list_sk_event_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  id uuid,
  barangay_id uuid,
  title text,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  created_by uuid,
  created_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  completed_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'published', 'completed', 'cancelled') then
    raise exception 'invalid SK event status filter';
  end if;

  return query
  with matching as (
    select sk_event.id, sk_event.barangay_id, sk_event.title, sk_event.description, sk_event.location,
      sk_event.starts_at, sk_event.ends_at, sk_event.status, sk_event.created_by, sk_event.created_at,
      sk_event.reviewed_by, sk_event.reviewed_at, sk_event.review_note, sk_event.completed_at
    from public.sk_events sk_event
    where sk_event.barangay_id = p_barangay_id
      and (v_status = 'all' or sk_event.status = v_status)
      and (v_search is null or position(v_search in lower(concat_ws(' ', sk_event.title, sk_event.description, sk_event.location))) > 0)
  ), counted as (
    select matching.*, count(*) over () as total_count
    from matching
  )
  select counted.id, counted.barangay_id, counted.title, counted.description, counted.location,
    counted.starts_at, counted.ends_at, counted.status, counted.created_by, counted.created_at,
    counted.reviewed_by, counted.reviewed_at, counted.review_note, counted.completed_at, counted.total_count
  from counted
  order by counted.starts_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_sk_event_page(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_sk_event_page(uuid, integer, integer, text, text) to authenticated;
