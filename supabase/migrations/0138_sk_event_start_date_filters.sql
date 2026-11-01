-- Apply local-date start windows consistently to SK event pages, summaries, and exports.
create index if not exists sk_events_tenant_start_window_idx
  on public.sk_events(barangay_id, starts_at, id);

create or replace function public.list_sk_event_page_in_window(
  p_barangay_id uuid, p_page integer, p_page_size integer, p_search text, p_status text,
  p_starts_after timestamptz, p_starts_before timestamptz
) returns table (
  id uuid, barangay_id uuid, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, status text, created_by uuid,
  created_at timestamptz, reviewed_by uuid, reviewed_at timestamptz,
  review_note text, completed_at timestamptz, total_count bigint
) language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'changes_requested', 'published', 'completed', 'cancelled') then
    raise exception 'invalid SK event status filter';
  end if;
  if p_starts_after is not null and p_starts_before is not null and p_starts_before <= p_starts_after then
    raise exception 'end of date range must be after its start';
  end if;

  return query
  with matching as (
    select event.id, event.barangay_id, event.title, event.description, event.location,
      event.starts_at, event.ends_at, event.status, event.created_by, event.created_at,
      event.reviewed_by, event.reviewed_at, event.review_note, event.completed_at
    from public.sk_events event
    where event.barangay_id = p_barangay_id
      and (v_status = 'all' or event.status = v_status)
      and (p_starts_after is null or event.starts_at >= p_starts_after)
      and (p_starts_before is null or event.starts_at < p_starts_before)
      and (v_search is null or position(v_search in lower(concat_ws(' ', event.title, event.description, event.location))) > 0)
  ), counted as (
    select matching.*, count(*) over () as total_count from matching
  )
  select counted.id, counted.barangay_id, counted.title, counted.description, counted.location,
    counted.starts_at, counted.ends_at, counted.status, counted.created_by, counted.created_at,
    counted.reviewed_by, counted.reviewed_at, counted.review_note, counted.completed_at, counted.total_count
  from counted order by counted.starts_at, counted.id
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;
revoke all on function public.list_sk_event_page_in_window(uuid, integer, integer, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.list_sk_event_page_in_window(uuid, integer, integer, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.get_sk_event_queue_window_summary(
  p_barangay_id uuid, p_search text, p_status text,
  p_starts_after timestamptz, p_starts_before timestamptz
) returns table (
  total_count bigint, awaiting_review_count bigint, changes_requested_count bigint,
  published_count bigint, completed_count bigint, cancelled_count bigint
) language plpgsql stable security invoker set search_path = '' as $$
declare
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'changes_requested', 'published', 'completed', 'cancelled') then
    raise exception 'invalid SK event status filter';
  end if;
  if p_starts_after is not null and p_starts_before is not null and p_starts_before <= p_starts_after then
    raise exception 'end of date range must be after its start';
  end if;

  return query
  select
    count(*) filter (where v_status = 'all' or event.status = v_status)::bigint,
    count(*) filter (where event.status = 'draft')::bigint,
    count(*) filter (where event.status = 'changes_requested')::bigint,
    count(*) filter (where event.status = 'published')::bigint,
    count(*) filter (where event.status = 'completed')::bigint,
    count(*) filter (where event.status = 'cancelled')::bigint
  from public.sk_events event
  where event.barangay_id = p_barangay_id
    and (p_starts_after is null or event.starts_at >= p_starts_after)
    and (p_starts_before is null or event.starts_at < p_starts_before)
    and (v_search is null or position(v_search in lower(concat_ws(' ', event.title, event.description, event.location))) > 0);
end;
$$;
revoke all on function public.get_sk_event_queue_window_summary(uuid, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_sk_event_queue_window_summary(uuid, text, text, timestamptz, timestamptz) to authenticated;
