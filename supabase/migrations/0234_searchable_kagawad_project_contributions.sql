-- Let Kagawads find their own project updates by text, type, and created date.
create or replace function public.search_kagawad_project_contribution_page(
  p_barangay_id uuid,
  p_page integer,
  p_page_size integer,
  p_search text,
  p_update_type text,
  p_created_after date,
  p_created_before date
)
returns table (
  update_id uuid,
  project_id uuid,
  project_title text,
  project_status text,
  update_type text,
  title text,
  details text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_update_type text := coalesce(nullif(p_update_type, ''), 'all');
begin
  if v_update_type not in ('all', 'milestone', 'progress') then
    raise exception 'invalid project contribution type filter';
  end if;
  if p_created_after is not null and p_created_before is not null
    and p_created_after > p_created_before then
    raise exception 'created-after date must be on or before created-before date';
  end if;

  if not public.is_active_member(p_barangay_id)
    or not exists (
      select 1
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    ) then
    raise exception 'not authorized';
  end if;

  return query
  with contributions as (
    select update_record.id as update_id, update_record.project_id,
      project.title as project_title, project.status as project_status,
      update_record.update_type, update_record.title, update_record.details,
      update_record.created_at
    from public.barangay_project_updates update_record
    join public.barangay_projects project
      on project.id = update_record.project_id
     and project.barangay_id = update_record.barangay_id
    where update_record.barangay_id = p_barangay_id
      and update_record.created_by = (select auth.uid())
      and (v_update_type = 'all' or update_record.update_type = v_update_type)
      and (p_created_after is null or (update_record.created_at at time zone 'Asia/Manila')::date >= p_created_after)
      and (p_created_before is null or (update_record.created_at at time zone 'Asia/Manila')::date <= p_created_before)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ',
        project.title, project.status, update_record.update_type,
        update_record.title, update_record.details
      ))) > 0)
  ), counted as (
    select contributions.*, count(*) over () as total_count
    from contributions
  )
  select counted.update_id, counted.project_id, counted.project_title,
    counted.project_status::text, counted.update_type, counted.title,
    counted.details, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.update_id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.search_kagawad_project_contribution_page(uuid, integer, integer, text, text, date, date) from public, anon;
grant execute on function public.search_kagawad_project_contribution_page(uuid, integer, integer, text, text, date, date) to authenticated;
