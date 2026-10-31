-- Page active referral destinations for authorized origin staff.
create or replace function public.list_referral_destination_page(
  p_origin_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null
)
returns table (
  id uuid,
  name text,
  municipality text,
  province text,
  code text,
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
begin
  if not public.has_tenant_permission(p_origin_barangay_id, 'referrals.create') then
    raise exception 'not authorized';
  end if;

  return query
  with destination_rows as (
    select b.id, b.name, b.municipality, b.province, b.code
    from public.barangays b
    where b.status = 'active'
      and b.id <> p_origin_barangay_id
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', b.name, b.municipality, b.province, b.code))) > 0)
  ), counted as (
    select destination_rows.*, count(*) over () as total_count
    from destination_rows
  )
  select counted.id, counted.name, counted.municipality, counted.province, counted.code, counted.total_count
  from counted
  order by counted.name, counted.municipality, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.get_referral_destinations(uuid) from authenticated;
revoke all on function public.list_referral_destination_page(uuid, integer, integer, text) from public, anon;
grant execute on function public.list_referral_destination_page(uuid, integer, integer, text) to authenticated;
