-- Let meeting organizers find active invitees without loading every workspace member.
create index if not exists barangay_memberships_active_directory_idx
  on public.barangay_memberships(barangay_id, status, user_id);

create or replace function public.list_meeting_member_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null
)
returns table (
  user_id uuid,
  display_name text,
  role_label text,
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
  if not public.has_tenant_permission(p_barangay_id, 'membership.read') then
    raise exception 'not authorized';
  end if;

  return query
  with active_members as (
    select m.user_id, p.display_name, r.label as role_label
    from public.barangay_memberships m
    join public.profiles p on p.id = m.user_id
    join public.role_definitions r on r.id = m.role_id
    where m.barangay_id = p_barangay_id
      and m.status = 'active'
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', p.display_name, r.label))) > 0)
  ), counted as (
    select active_members.*, count(*) over () as total_count
    from active_members
  )
  select counted.user_id, counted.display_name, counted.role_label, counted.total_count
  from counted
  order by counted.display_name nulls last, counted.user_id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_meeting_member_page(uuid, integer, integer, text) from public, anon;
grant execute on function public.list_meeting_member_page(uuid, integer, integer, text) to authenticated;
