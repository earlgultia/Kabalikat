-- Replace complete Tanod directory reads with a tenant- and permission-checked picker.
create index if not exists barangay_memberships_tanod_picker_idx
  on public.barangay_memberships(barangay_id, status, role_id, user_id);

create or replace function public.list_active_tanod_page(
  p_barangay_id uuid,
  p_permission text,
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_selected_user_id uuid default null
)
returns table (user_id uuid, display_name text, total_count bigint)
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
  if p_permission not in ('incident.manage', 'patrol.manage')
    or not public.has_tenant_permission(p_barangay_id, p_permission) then
    raise exception 'not authorized';
  end if;

  return query
  with eligible as (
    select m.user_id, coalesce(nullif(p.display_name, ''), 'Tanod') as display_name
    from public.barangay_memberships m
    join public.role_definitions r on r.id = m.role_id and r.key = 'tanod'
    join public.profiles p on p.id = m.user_id
    where m.barangay_id = p_barangay_id and m.status = 'active'
  ), filtered as (
    select e.user_id, e.display_name from eligible e
    where v_search is null or position(lower(v_search) in lower(e.display_name)) > 0
  ), page_rows as (
    select f.user_id, f.display_name from filtered f
    order by f.display_name, f.user_id
    offset v_page::bigint * v_page_size limit v_page_size
  ), selected_row as (
    select e.user_id, e.display_name from eligible e
    where e.user_id = p_selected_user_id
  )
  select result.user_id, result.display_name, (select count(*) from filtered)::bigint
  from (
    select p.user_id, p.display_name from page_rows p
    union all
    select s.user_id, s.display_name from selected_row s
    where not exists (select 1 from page_rows p where p.user_id = s.user_id)
  ) result
  order by result.display_name, result.user_id;
end;
$$;

revoke all on function public.list_active_tanod_page(uuid, text, integer, integer, text, uuid) from public, anon;
grant execute on function public.list_active_tanod_page(uuid, text, integer, integer, text, uuid) to authenticated;
revoke all on function public.get_incident_assignees(uuid) from authenticated;
revoke all on function public.get_patrol_assignees(uuid) from authenticated;
