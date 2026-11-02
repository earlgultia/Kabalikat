-- Keep Captain staff access screens responsive in larger barangays.
create index if not exists memberships_tenant_access_page_idx
  on public.barangay_memberships(barangay_id, status, created_at, id);

create or replace function public.list_barangay_membership_access_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  id uuid,
  user_id uuid,
  role_id uuid,
  status text,
  created_at timestamptz,
  role_key text,
  role_label text,
  display_name text,
  total_count bigint,
  active_count bigint,
  suspended_count bigint
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
  if not public.has_tenant_permission(p_barangay_id, 'membership.manage') then
    raise exception 'not authorized';
  end if;
  if v_status not in ('all', 'active', 'suspended') then
    raise exception 'invalid membership status filter';
  end if;

  return query
  with members as (
    select m.id, m.user_id, m.role_id, m.status::text as status, m.created_at,
      r.key as role_key, r.label as role_label,
      coalesce(nullif(trim(p.display_name), ''), 'Barangay member') as display_name
    from public.barangay_memberships m
    join public.role_definitions r on r.id = m.role_id
    left join public.profiles p on p.id = m.user_id
    where m.barangay_id = p_barangay_id
      and m.status in ('active', 'suspended')
      and (v_status = 'all' or m.status::text = v_status)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ',
        p.display_name, r.label, r.key
      ))) > 0)
  ), counted as (
    select members.*,
      count(*) over () as total_count,
      count(*) filter (where members.status = 'active') over () as active_count,
      count(*) filter (where members.status = 'suspended') over () as suspended_count
    from members
  )
  select counted.id, counted.user_id, counted.role_id, counted.status, counted.created_at,
    counted.role_key, counted.role_label, counted.display_name,
    counted.total_count, counted.active_count, counted.suspended_count
  from counted
  order by counted.created_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_barangay_membership_access_page(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_barangay_membership_access_page(uuid, integer, integer, text, text) to authenticated;
