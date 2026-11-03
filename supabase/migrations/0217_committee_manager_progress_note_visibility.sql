-- Allow active committee managers to review progress notes from assigned Kagawads.
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
  v_is_assignee boolean;
  v_is_manager boolean;
begin
  select task.barangay_id,
    task.assigned_to = (select auth.uid()) and exists (
      select 1
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = task.barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    ),
    public.has_tenant_permission(task.barangay_id, 'committee.manage')
  into v_barangay_id, v_is_assignee, v_is_manager
  from public.committee_tasks task
  join public.committees committee
    on committee.id = task.committee_id
   and committee.barangay_id = task.barangay_id
  where task.id = p_task_id
    and committee.status = 'active'
    and public.is_active_member(task.barangay_id);

  if v_barangay_id is null or not coalesce(v_is_assignee, false) and not coalesce(v_is_manager, false) then
    raise exception 'not authorized';
  end if;

  return query
  select note_record.id, note_record.note,
    coalesce(nullif(profile.display_name, ''), 'Committee member')::text as author_name,
    note_record.created_at
  from public.committee_task_progress_notes note_record
  left join public.profiles profile on profile.id = note_record.author_id
  where note_record.task_id = p_task_id
  order by note_record.created_at desc, note_record.id desc
  limit 50;
end;
$$;

revoke all on function public.list_kagawad_action_item_notes(uuid) from public, anon;
grant execute on function public.list_kagawad_action_item_notes(uuid) to authenticated;
