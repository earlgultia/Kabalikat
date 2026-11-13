-- Match the Captain's SK project shortcut to proposals submitted by other
-- members, which are the records counted in the Captain dashboard summary.
create or replace function public.list_captain_sk_project_review_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20
)
returns table (
  id uuid,
  title text,
  description text,
  proposed_budget numeric,
  planned_start date,
  planned_end date,
  status text,
  created_by uuid,
  reviewed_by uuid,
  review_note text,
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
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
begin
  if not public.has_tenant_permission(p_barangay_id, 'sk.review') then
    raise exception 'not authorized';
  end if;

  return query
  with matching as (
    select project.id, project.title, project.description,
      project.proposed_budget, project.planned_start, project.planned_end,
      project.status::text as status, project.created_by, project.reviewed_by,
      project.review_note, project.created_at
    from public.sk_projects project
    where project.barangay_id = p_barangay_id
      and project.status = 'submitted'
      and project.created_by <> (select auth.uid())
  ), counted as (
    select matching.*, count(*) over () as total_count
    from matching
  )
  select counted.id, counted.title, counted.description,
    counted.proposed_budget, counted.planned_start, counted.planned_end,
    counted.status, counted.created_by, counted.reviewed_by,
    counted.review_note, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_captain_sk_project_review_page(uuid, integer, integer) from public, anon;
grant execute on function public.list_captain_sk_project_review_page(uuid, integer, integer) to authenticated;
