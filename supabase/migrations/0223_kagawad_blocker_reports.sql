-- Atomically mark an assigned Kagawad task blocked, record the status event,
-- and append the reason to the existing manager-notified progress thread.
create or replace function public.report_kagawad_task_blocker(
  p_task_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.committee_tasks%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select task.* into v_task
  from public.committee_tasks task
  join public.committees committee
    on committee.id = task.committee_id
   and committee.barangay_id = task.barangay_id
  join public.barangay_memberships membership
    on membership.barangay_id = task.barangay_id
   and membership.user_id = (select auth.uid())
   and membership.status = 'active'
  join public.role_definitions role on role.id = membership.role_id
  where task.id = p_task_id
    and task.assigned_to = (select auth.uid())
    and committee.status = 'active'
    and role.key = 'kagawad'
    and public.is_active_member(task.barangay_id)
  for update of task;

  if not found then raise exception 'task not found or not authorized'; end if;
  if length(v_reason) not between 3 and 2000 then
    raise exception 'blocker reason must be between 3 and 2000 characters';
  end if;

  if v_task.status <> 'blocked' then
    update public.committee_tasks
    set status = 'blocked', updated_by = (select auth.uid()), updated_at = now()
    where id = v_task.id;

    insert into public.committee_events(barangay_id, committee_id, task_id, actor_id, action, details)
    values (v_task.barangay_id, v_task.committee_id, v_task.id, (select auth.uid()),
      'task_status_changed', v_task.status::text || ' -> blocked');
  end if;

  insert into public.committee_task_progress_notes(barangay_id, committee_id, task_id, author_id, note)
  values (v_task.barangay_id, v_task.committee_id, v_task.id, (select auth.uid()), v_reason);
end;
$$;

revoke all on function public.report_kagawad_task_blocker(uuid, text) from public, anon;
grant execute on function public.report_kagawad_task_blocker(uuid, text) to authenticated;
