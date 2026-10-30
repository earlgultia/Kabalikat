-- Search and page the document request queue while preserving table RLS.
create index if not exists document_requests_tenant_submitted_page_idx
  on public.document_requests(barangay_id, submitted_at desc, id desc);

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
  if v_status not in ('all', 'pending', 'under_review', 'awaiting_approval', 'approved', 'rejected', 'issued', 'released', 'cancelled') then
    raise exception 'invalid document request status filter';
  end if;

  return query
  with matching_requests as (
    select d.id, d.submitted_at
    from public.document_requests d
    left join public.residents r on r.id = d.resident_id and r.barangay_id = d.barangay_id
    left join public.document_types t on t.id = d.document_type_id and t.barangay_id = d.barangay_id
    where d.barangay_id = p_barangay_id
      and (v_status = 'all' or d.status = v_status)
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

-- Keep status history bounded to the request page currently being viewed.
create or replace function public.list_document_request_page_activity(
  p_barangay_id uuid,
  p_request_ids uuid[]
)
returns table (
  request_id uuid,
  from_status text,
  to_status text,
  reason text,
  actor_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_request_ids is null or cardinality(p_request_ids) > 100 then
    raise exception 'invalid request page';
  end if;
  if not public.has_tenant_permission(p_barangay_id, 'document.request.read')
    and not exists (
      select 1
      from public.document_requests d
      join public.residents r on r.id = d.resident_id and r.barangay_id = d.barangay_id
      where d.barangay_id = p_barangay_id and d.id = any(p_request_ids) and r.user_id = auth.uid()
    ) then
    raise exception 'not authorized';
  end if;

  return query
    select e.request_id, e.from_status, e.to_status, e.reason,
      case when e.actor_id = auth.uid() then 'You'
        else coalesce(nullif(p.display_name, ''), 'Workspace member') end,
      e.created_at
    from public.document_request_events e
    join public.document_requests d on d.id = e.request_id and d.barangay_id = e.barangay_id
    join public.profiles p on p.id = e.actor_id
    where e.barangay_id = p_barangay_id
      and e.request_id = any(p_request_ids)
      and (public.has_tenant_permission(p_barangay_id, 'document.request.read')
        or exists (
          select 1 from public.residents r
          where r.id = d.resident_id and r.barangay_id = d.barangay_id and r.user_id = auth.uid()
        ))
    order by e.created_at desc;
end;
$$;

revoke all on function public.list_document_request_page_activity(uuid, uuid[]) from public, anon;
grant execute on function public.list_document_request_page_activity(uuid, uuid[]) to authenticated;
