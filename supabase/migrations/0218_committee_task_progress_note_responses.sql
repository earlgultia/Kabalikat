-- Let an authorized committee manager respond in the task progress history.
create or replace function public.add_committee_task_progress_note(p_task_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.committee_tasks%rowtype;
  v_is_assigned_kagawad boolean;
  v_is_manager boolean;
  v_note_id uuid;
  v_note text := trim(coalesce(p_note, ''));
begin
  select task.* into v_task
  from public.committee_tasks task
  join public.committees committee
    on committee.id = task.committee_id
   and committee.barangay_id = task.barangay_id
  where task.id = p_task_id
    and committee.status = 'active'
    and public.is_active_member(task.barangay_id)
  for update of task;

  if not found then raise exception 'task not found or not authorized'; end if;
  if length(v_note) not between 3 and 2000 then raise exception 'note must be between 3 and 2000 characters'; end if;

  select exists (
    select 1
    from public.barangay_memberships membership
    join public.role_definitions role on role.id = membership.role_id
    where membership.barangay_id = v_task.barangay_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and role.key = 'kagawad'
  ) and v_task.assigned_to = (select auth.uid())
  into v_is_assigned_kagawad;

  v_is_manager := public.has_tenant_permission(v_task.barangay_id, 'committee.manage');
  if not coalesce(v_is_assigned_kagawad, false) and not coalesce(v_is_manager, false) then
    raise exception 'not authorized';
  end if;

  insert into public.committee_task_progress_notes(barangay_id, committee_id, task_id, author_id, note)
  values (v_task.barangay_id, v_task.committee_id, v_task.id, (select auth.uid()), v_note)
  returning id into v_note_id;

  return v_note_id;
end;
$$;

revoke all on function public.add_committee_task_progress_note(uuid, text) from public, anon;
grant execute on function public.add_committee_task_progress_note(uuid, text) to authenticated;
