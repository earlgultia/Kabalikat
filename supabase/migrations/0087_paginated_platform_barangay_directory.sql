-- Keep the platform tenant directory bounded while retaining admin-only access.
create index if not exists barangays_platform_directory_page_idx
  on public.barangays(name, municipality, id);

create or replace function public.list_platform_barangay_directory_page(
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  id uuid,
  name text,
  municipality text,
  province text,
  code text,
  status text,
  created_at timestamptz,
  active_members bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if v_status not in ('all', 'active', 'suspended', 'archived', 'needs_attention') then
    raise exception 'invalid barangay status filter';
  end if;

  return query
  with directory_rows as (
    select b.id, b.name, b.municipality, b.province, b.code, b.status::text as status, b.created_at,
      count(m.id) filter (where m.status = 'active') as active_members
    from public.barangays b
    left join public.barangay_memberships m on m.barangay_id = b.id
    where (v_search is null or position(lower(v_search) in lower(concat_ws(' ', b.name, b.municipality, b.province, b.code))) > 0)
      and (v_status = 'all' or (v_status = 'needs_attention' and b.status::text in ('suspended', 'archived')) or b.status::text = v_status)
    group by b.id
  ), counted as (
    select directory_rows.*, count(*) over () as total_count
    from directory_rows
  )
  select counted.id, counted.name, counted.municipality, counted.province, counted.code,
    counted.status, counted.created_at, counted.active_members, counted.total_count
  from counted
  order by counted.name, counted.municipality, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

create or replace function public.get_platform_barangay_directory_summary()
returns table (registered_count bigint, active_count bigint, needs_attention_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  return query
  select count(*)::bigint,
    count(*) filter (where b.status::text = 'active')::bigint,
    count(*) filter (where b.status::text in ('suspended', 'archived'))::bigint
  from public.barangays b;
end;
$$;

revoke all on function public.list_platform_barangay_directory_page(integer, integer, text, text) from public, anon;
revoke all on function public.get_platform_barangay_directory_summary() from public, anon;
grant execute on function public.list_platform_barangay_directory_page(integer, integer, text, text) to authenticated;
grant execute on function public.get_platform_barangay_directory_summary() to authenticated;
