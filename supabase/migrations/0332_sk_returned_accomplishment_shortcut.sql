-- Route an SK Chairperson directly to their returned accomplishment summary.
create index if not exists sk_returned_accomplishment_owner_idx
  on public.sk_public_accomplishments(barangay_id, created_by, reviewed_at desc, project_id)
  where status = 'returned';

create or replace function public.get_my_returned_sk_accomplishment_target(p_barangay_id uuid)
returns table (project_id uuid, page_number integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(p_barangay_id)
    or not public.has_tenant_permission(p_barangay_id, 'sk.manage') then
    raise exception 'not authorized';
  end if;

  return query
  with ranked_projects as (
    select project.id,
      ((row_number() over (order by project.created_at desc, project.id desc) - 1) / 20)::integer as page_number
    from public.sk_projects project
    where project.barangay_id = p_barangay_id
      and project.status = 'completed'
  )
  select project.id, project.page_number
  from public.sk_public_accomplishments accomplishment
  join ranked_projects project on project.id = accomplishment.project_id
  where accomplishment.barangay_id = p_barangay_id
    and accomplishment.created_by = (select auth.uid())
    and accomplishment.status = 'returned'
  order by accomplishment.reviewed_at desc nulls last, accomplishment.id desc
  limit 1;
end;
$$;

revoke all on function public.get_my_returned_sk_accomplishment_target(uuid) from public, anon;
grant execute on function public.get_my_returned_sk_accomplishment_target(uuid) to authenticated;
