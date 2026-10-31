-- Page project progress and SK audit history rather than loading history for all visible projects.
create index if not exists barangay_project_updates_history_page_idx
  on public.barangay_project_updates(barangay_id, project_id, created_at desc, id desc);

create index if not exists sk_project_updates_history_page_idx
  on public.sk_project_updates(barangay_id, project_id, created_at desc, id desc);

create index if not exists sk_project_events_history_page_idx
  on public.sk_project_events(barangay_id, project_id, created_at desc, id desc);

create or replace function public.list_barangay_project_update_page(
  p_project_id uuid,
  p_page integer default 0,
  p_page_size integer default 25
)
returns table (
  id uuid,
  project_id uuid,
  update_type text,
  title text,
  details text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  return query
  with counted as (
    select u.id, u.project_id, u.update_type, u.title, u.details, u.created_at,
      count(*) over () as total_count
    from public.barangay_project_updates u
    join public.barangay_projects p on p.id = u.project_id and p.barangay_id = u.barangay_id
    where u.project_id = p_project_id
  )
  select counted.id, counted.project_id, counted.update_type, counted.title,
    counted.details, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;

create or replace function public.list_sk_project_update_page(
  p_project_id uuid,
  p_page integer default 0,
  p_page_size integer default 25
)
returns table (
  id uuid,
  project_id uuid,
  update_type text,
  title text,
  details text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  return query
  with counted as (
    select u.id, u.project_id, u.update_type, u.title, u.details, u.created_at,
      count(*) over () as total_count
    from public.sk_project_updates u
    join public.sk_projects p on p.id = u.project_id and p.barangay_id = u.barangay_id
    where u.project_id = p_project_id
  )
  select counted.id, counted.project_id, counted.update_type, counted.title,
    counted.details, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;

create or replace function public.list_sk_project_activity_page(
  p_project_id uuid,
  p_page integer default 0,
  p_page_size integer default 25
)
returns table (
  action text,
  details text,
  actor_name text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_barangay_id uuid;
begin
  select p.barangay_id into v_barangay_id from public.sk_projects p where p.id = p_project_id;
  if v_barangay_id is null or (not public.has_tenant_permission(v_barangay_id, 'sk.manage')
    and not public.has_tenant_permission(v_barangay_id, 'sk.review')) then
    raise exception 'not authorized';
  end if;

  return query
  with counted as (
    select e.action, e.details,
      coalesce(nullif(p.display_name, ''), 'Workspace member') as actor_name,
      e.created_at, e.id, count(*) over () as total_count
    from public.sk_project_events e
    join public.profiles p on p.id = e.actor_id
    where e.barangay_id = v_barangay_id and e.project_id = p_project_id
  )
  select counted.action, counted.details, counted.actor_name, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;

revoke all on function public.list_barangay_project_update_page(uuid, integer, integer) from public, anon;
grant execute on function public.list_barangay_project_update_page(uuid, integer, integer) to authenticated;
revoke all on function public.list_sk_project_update_page(uuid, integer, integer) from public, anon;
grant execute on function public.list_sk_project_update_page(uuid, integer, integer) to authenticated;
revoke all on function public.list_sk_project_activity_page(uuid, integer, integer) from public, anon;
grant execute on function public.list_sk_project_activity_page(uuid, integer, integer) to authenticated;
revoke all on function public.list_sk_project_activity(uuid) from authenticated;
revoke all on function public.list_sk_project_activity_for_projects(uuid, uuid[]) from authenticated;
