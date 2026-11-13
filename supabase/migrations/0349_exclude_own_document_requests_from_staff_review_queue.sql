-- Match the Captain and Secretary document review counts by omitting requests
-- belonging to the current user from the shared staff review shortcut.
create or replace function public.list_document_request_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_status text default 'all'
)
returns table (request_id uuid, total_count bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'review_queue', 'in_progress', 'pending', 'under_review', 'awaiting_approval', 'approved', 'rejected', 'issued', 'released', 'cancelled') then
    raise exception 'invalid document request status filter';
  end if;

  return query
  with matching_requests as (
    select d.id, d.submitted_at
    from public.document_requests d
    left join public.residents r
      on r.id = d.resident_id and r.barangay_id = d.barangay_id
    left join public.document_types t
      on t.id = d.document_type_id and t.barangay_id = d.barangay_id
    where d.barangay_id = p_barangay_id
      and (
        v_status = 'all'
        or (v_status = 'review_queue'
          and d.status in ('pending', 'under_review', 'awaiting_approval')
          and (r.user_id is null or r.user_id <> (select auth.uid())))
        or (v_status = 'in_progress'
          and d.status in ('pending', 'under_review', 'awaiting_approval', 'approved', 'issued'))
        or d.status = v_status
      )
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ',
        d.reference_number, d.purpose, concat_ws(' ', r.first_name, r.last_name), t.name
      ))) > 0)
  ), counted as (
    select matching_requests.*, count(*) over () as total_count
    from matching_requests
  )
  select counted.id, counted.total_count
  from counted
  order by counted.submitted_at desc, counted.id desc
  offset v_page * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_document_request_page(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_document_request_page(uuid, integer, integer, text, text) to authenticated;
