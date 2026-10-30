-- Return a bounded resident directory page with the latest residency decision.
-- SECURITY INVOKER preserves the table grants and row-level security policies.
create index if not exists residency_verifications_latest_resident_idx
  on public.residency_verifications(resident_id, barangay_id, created_at desc, id desc);

create or replace function public.list_resident_directory_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_verification_status text default 'all'
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  birth_date date,
  phone text,
  record_status text,
  household_id uuid,
  household_code text,
  address_line text,
  purok text,
  verification_status text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_status text := coalesce(nullif(p_verification_status, ''), 'all');
begin
  if v_status not in ('all', 'pending', 'verified', 'rejected') then
    raise exception 'invalid residency status filter';
  end if;

  return query
  with resident_rows as (
    select r.id, r.first_name, r.last_name, r.birth_date, r.phone, r.record_status,
      r.household_id, h.household_code, h.address_line, h.purok,
      coalesce(latest.status, 'pending')::text as latest_status
    from public.residents r
    left join public.households h on h.id = r.household_id and h.barangay_id = r.barangay_id
    left join lateral (
      select rv.status
      from public.residency_verifications rv
      where rv.resident_id = r.id and rv.barangay_id = r.barangay_id
      order by rv.created_at desc, rv.id desc
      limit 1
    ) latest on true
    where r.barangay_id = p_barangay_id
      and (v_status = 'all' or coalesce(latest.status, 'pending')::text = v_status)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ',
        r.first_name, r.last_name, r.phone, h.household_code, h.address_line, h.purok
      ))) > 0)
  ), counted as (
    select resident_rows.*, count(*) over () as total_count
    from resident_rows
  )
  select counted.id, counted.first_name, counted.last_name, counted.birth_date, counted.phone,
    counted.record_status::text, counted.household_id, counted.household_code, counted.address_line,
    counted.purok, counted.latest_status, counted.total_count
  from counted
  order by counted.last_name, counted.first_name, counted.id
  offset v_page * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_resident_directory_page(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_resident_directory_page(uuid, integer, integer, text, text) to authenticated;
