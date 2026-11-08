-- Retain historical Kagawad note access without removing manager visibility.
create or replace function public.list_kagawad_action_item_notes(p_task_id uuid)
returns table (
  id uuid,
  note text,
  author_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
  v_is_kagawad boolean;
  v_is_manager boolean;
begin
  select task.barangay_id,
    exists (
      select 1
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = task.barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    ) and exists (
      select 1
      from public.committee_task_assignment_events assignment
      where assignment.task_id = task.id
        and assignment.barangay_id = task.barangay_id
        and assignment.assigned_to = (select auth.uid())
    ),
    committee.status = 'active'
      and public.has_tenant_permission(task.barangay_id, 'committee.manage')
  into v_barangay_id, v_is_kagawad, v_is_manager
  from public.committee_tasks task
  join public.committees committee
    on committee.id = task.committee_id
   and committee.barangay_id = task.barangay_id
  where task.id = p_task_id
    and public.is_active_member(task.barangay_id);

  if v_barangay_id is null
    or (not coalesce(v_is_kagawad, false) and not coalesce(v_is_manager, false)) then
    raise exception 'not authorized';
  end if;

  return query
  select note_record.id, note_record.note,
    coalesce(nullif(profile.display_name, ''), 'Committee member')::text as author_name,
    note_record.created_at
  from public.committee_task_progress_notes note_record
  left join public.profiles profile on profile.id = note_record.author_id
  where note_record.task_id = p_task_id
    and (coalesce(v_is_manager, false) or note_record.author_id = (select auth.uid()))
  order by note_record.created_at desc, note_record.id desc
  limit 50;
end;
$$;

revoke all on function public.list_kagawad_action_item_notes(uuid) from public, anon;
grant execute on function public.list_kagawad_action_item_notes(uuid) to authenticated;
