-- Keep project contribution replies and their notifications within the
-- Community Programs entitlement, including the author's self-access path.
create or replace function public.can_access_barangay_project_update_responses(
  p_update_id uuid,
  p_barangay_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member(p_barangay_id)
    and public.tenant_plan_feature_enabled(p_barangay_id, 'community_programs')
    and exists (
      select 1
      from public.barangay_project_updates update_record
      where update_record.id = p_update_id
        and update_record.barangay_id = p_barangay_id
        and (
          public.has_tenant_permission(p_barangay_id, 'project.manage')
          or update_record.created_by = (select auth.uid())
        )
    );
$$;

create or replace function public.can_access_barangay_project_update_notification(
  p_project_id uuid,
  p_barangay_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member(p_barangay_id)
    and public.tenant_plan_feature_enabled(p_barangay_id, 'community_programs')
    and public.has_tenant_permission(p_barangay_id, 'project.manage')
    and exists (
      select 1 from public.barangay_projects project
      where project.id = p_project_id
        and project.barangay_id = p_barangay_id
    )
    and exists (
      select 1 from public.barangay_project_updates update_record
      where update_record.project_id = p_project_id
        and update_record.barangay_id = p_barangay_id
        and update_record.created_by <> (select auth.uid())
    );
$$;

create or replace function public.can_access_barangay_project_update_response_notification(
  p_update_id uuid,
  p_barangay_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member(p_barangay_id)
    and public.tenant_plan_feature_enabled(p_barangay_id, 'community_programs')
    and exists (
      select 1
      from public.barangay_project_updates update_record
      where update_record.id = p_update_id
        and update_record.barangay_id = p_barangay_id
        and (
          public.has_tenant_permission(p_barangay_id, 'project.manage')
          or update_record.created_by = (select auth.uid())
        )
    );
$$;

revoke all on function public.can_access_barangay_project_update_responses(uuid, uuid)
  from public, anon;
revoke all on function public.can_access_barangay_project_update_notification(uuid, uuid)
  from public, anon;
revoke all on function public.can_access_barangay_project_update_response_notification(uuid, uuid)
  from public, anon;
grant execute on function public.can_access_barangay_project_update_responses(uuid, uuid)
  to authenticated;
grant execute on function public.can_access_barangay_project_update_notification(uuid, uuid)
  to authenticated;
grant execute on function public.can_access_barangay_project_update_response_notification(uuid, uuid)
  to authenticated;

-- The target RPC reveals project and response pagination positions for an
-- author's reply notification. Keep its existing result logic behind a gate.
alter function public.get_my_project_response_notification_target(uuid)
  rename to get_my_project_response_notification_target_unchecked;
revoke all on function public.get_my_project_response_notification_target_unchecked(uuid)
  from public, anon, authenticated;

create function public.get_my_project_response_notification_target(p_update_id uuid)
returns table (
  project_id uuid,
  project_page integer,
  update_page integer,
  response_page integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
begin
  select update_record.barangay_id into v_barangay_id
  from public.barangay_project_updates update_record
  where update_record.id = p_update_id;

  if v_barangay_id is null
    or not public.tenant_plan_feature_enabled(v_barangay_id, 'community_programs') then
    return;
  end if;

  return query
  select target.project_id, target.project_page,
    target.update_page, target.response_page
  from public.get_my_project_response_notification_target_unchecked(p_update_id) target;
end;
$$;

revoke all on function public.get_my_project_response_notification_target(uuid)
  from public, anon;
grant execute on function public.get_my_project_response_notification_target(uuid)
  to authenticated;
