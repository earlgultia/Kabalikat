-- Prevent assigned Kagawads from bypassing the auditable completion-summary
-- workflow through the generic status RPC.
create or replace function public.update_committee_task_status(
  p_task_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.committee_tasks%rowtype;
  v_manager boolean;
begin
  select * into v_task
  from public.committee_tasks
  where id = p_task_id
  for update;
  if not found then raise exception 'action item not found'; end if;

  v_manager := public.has_tenant_permission(v_task.barangay_id, 'committee.manage');
  if not v_manager and (
    not public.is_committee_member(v_task.committee_id)
    or v_task.assigned_to is distinct from (select auth.uid())
  ) then
    raise exception 'only the assigned member or committee manager can update this action item';
  end if;
  if p_status not in ('open', 'in_progress', 'blocked', 'completed') then
    raise exception 'invalid action item status';
  end if;
  if v_task.status = p_status then return; end if;

  if p_status = 'completed'
    and v_task.assigned_to = (select auth.uid())
    and exists (
      select 1
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = v_task.barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    ) then
    raise exception 'submit a completion summary to complete your assigned task';
  end if;

  update public.committee_tasks
  set status = p_status, updated_by = (select auth.uid()), updated_at = now()
  where id = p_task_id;
  insert into public.committee_events(barangay_id, committee_id, task_id, actor_id, action, details)
  values (v_task.barangay_id, v_task.committee_id, v_task.id, (select auth.uid()),
    'task_status_changed', v_task.status || ' -> ' || p_status);
end;
$$;

revoke all on function public.update_committee_task_status(uuid, text) from public, anon;
grant execute on function public.update_committee_task_status(uuid, text) to authenticated;
