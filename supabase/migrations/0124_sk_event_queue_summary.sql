-- Expose RLS-aware SK schedule totals and reviewer queue counts.
create or replace function public.get_sk_event_queue_summary(
  p_barangay_id uuid,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  total_count bigint,
  awaiting_review_count bigint,
  published_count bigint,
  completed_count bigint,
  returned_count bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'published', 'completed', 'cancelled') then
    raise exception 'invalid SK event status filter';
  end if;

  return query
  select
    count(*) filter (where v_status = 'all' or event.status = v_status)::bigint,
    count(*) filter (where event.status = 'draft')::bigint,
    count(*) filter (where event.status = 'published')::bigint,
    count(*) filter (where event.status = 'completed')::bigint,
    count(*) filter (where event.status = 'cancelled')::bigint
  from public.sk_events event
  where event.barangay_id = p_barangay_id
    and (v_search is null or position(v_search in lower(concat_ws(' ', event.title, event.description, event.location))) > 0);
end;
$$;
revoke all on function public.get_sk_event_queue_summary(uuid, text, text) from public, anon;
grant execute on function public.get_sk_event_queue_summary(uuid, text, text) to authenticated;
