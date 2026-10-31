-- Return platform support tickets with tenant labels without downloading the full tenant directory.
create index if not exists support_tickets_platform_updated_page_idx
  on public.support_tickets(updated_at desc, id desc);

create or replace function public.list_platform_support_ticket_page(
  p_page integer default 0,
  p_page_size integer default 50,
  p_status text default 'all',
  p_search text default null
)
returns table (
  id uuid,
  barangay_id uuid,
  barangay_name text,
  requester_id uuid,
  category text,
  subject text,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_status text := coalesce(nullif(p_status, ''), 'all');
  v_search text := nullif(left(trim(coalesce(p_search, '')), 180), '');
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if v_status not in ('all', 'new', 'in_progress', 'waiting_on_requester', 'resolved', 'closed') then
    raise exception 'invalid support status filter';
  end if;

  return query
  with queue_rows as (
    select t.id, t.barangay_id, b.name as barangay_name, t.requester_id, t.category,
      t.subject, t.description, t.status, t.created_at, t.updated_at
    from public.support_tickets t
    join public.barangays b on b.id = t.barangay_id
    where (v_status = 'all' or t.status = v_status)
      and (v_search is null or position(lower(v_search) in lower(t.subject)) > 0)
  ), counted as (
    select queue_rows.*, count(*) over () as total_count
    from queue_rows
  )
  select counted.id, counted.barangay_id, counted.barangay_name, counted.requester_id,
    counted.category, counted.subject, counted.description, counted.status,
    counted.created_at, counted.updated_at, counted.total_count
  from counted
  order by counted.updated_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_platform_support_ticket_page(integer, integer, text, text) from public, anon;
grant execute on function public.list_platform_support_ticket_page(integer, integer, text, text) to authenticated;
