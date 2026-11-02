-- Give platform administrators a paginated view of active requests with no recent activity.
create index if not exists support_tickets_attention_idx
  on public.support_tickets(updated_at desc, id desc)
  where status in ('new', 'in_progress');

create or replace function public.list_platform_support_attention_page(
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
    select ticket.id, ticket.barangay_id, barangay.name as barangay_name,
      ticket.requester_id, ticket.category, ticket.subject, ticket.description,
      ticket.status, ticket.created_at, ticket.updated_at
    from public.support_tickets as ticket
    join public.barangays as barangay on barangay.id = ticket.barangay_id
    where ticket.status in ('new', 'in_progress')
      and ticket.updated_at < now() - interval '3 days'
      and (v_status = 'all' or ticket.status = v_status)
      and (v_search is null or position(lower(v_search) in lower(ticket.subject)) > 0)
  ), counted as (
    select queue_rows.*, count(*) over () as total_count
    from queue_rows
  )
  select counted.id, counted.barangay_id, counted.barangay_name, counted.requester_id,
    counted.category, counted.subject, counted.description, counted.status,
    counted.created_at, counted.updated_at, counted.total_count
  from counted
  order by counted.updated_at asc, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

create or replace function public.get_platform_support_attention_count()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  select count(*)::bigint into v_count
  from public.support_tickets as ticket
  where ticket.status in ('new', 'in_progress')
    and ticket.updated_at < now() - interval '3 days';
  return v_count;
end;
$$;

revoke all on function public.list_platform_support_attention_page(integer, integer, text, text) from public, anon;
revoke all on function public.get_platform_support_attention_count() from public, anon;
grant execute on function public.list_platform_support_attention_page(integer, integer, text, text) to authenticated;
grant execute on function public.get_platform_support_attention_count() to authenticated;
