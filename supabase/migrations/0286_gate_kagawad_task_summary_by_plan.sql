-- Keep the Kagawad dashboard counts behind the same plan gate as its task
-- queue, and calculate due-date buckets on the Manila calendar day.
create or replace function public.get_kagawad_action_item_summary(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'Asia/Manila'
as $$
declare
  v_open bigint;
  v_in_progress bigint;
  v_blocked bigint;
  v_overdue bigint;
  v_due_soon bigint;
  v_completed_by_me bigint;
begin
  if not public.is_active_member(p_barangay_id)
    or not public.tenant_plan_feature_enabled(p_barangay_id, 'community_programs')
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

  select
    count(*) filter (where task.status = 'open'),
    count(*) filter (where task.status = 'in_progress'),
    count(*) filter (where task.status = 'blocked'),
    count(*) filter (where task.status <> 'completed' and task.due_date < current_date),
    count(*) filter (where task.status <> 'completed'
      and task.due_date between current_date and current_date + 7)
  into v_open, v_in_progress, v_blocked, v_overdue, v_due_soon
  from public.committee_tasks task
  join public.committees committee
    on committee.id = task.committee_id
   and committee.barangay_id = task.barangay_id
  where task.barangay_id = p_barangay_id
    and task.assigned_to = (select auth.uid())
    and committee.status = 'active';

  select count(distinct event.id)
  into v_completed_by_me
  from public.committee_events event
  join public.committee_task_progress_notes note
    on note.task_id = event.task_id
   and note.barangay_id = event.barangay_id
   and note.committee_id = event.committee_id
   and note.author_id = (select auth.uid())
   and note.created_at = event.created_at
  where event.barangay_id = p_barangay_id
    and event.actor_id = (select auth.uid())
    and event.action = 'task_status_changed'
    and right(event.details, length(' -> completed')) = ' -> completed'
    and exists (
      select 1
      from public.committee_task_assignment_events assignment
      where assignment.task_id = event.task_id
        and assignment.barangay_id = event.barangay_id
        and assignment.assigned_to = (select auth.uid())
        and assignment.assigned_at <= event.created_at
    );

  return jsonb_build_object(
    'open_action_items', v_open,
    'in_progress_action_items', v_in_progress,
    'blocked_action_items', v_blocked,
    'overdue_action_items', v_overdue,
    'due_soon_action_items', v_due_soon,
    'completed_by_me', v_completed_by_me,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_kagawad_action_item_summary(uuid) from public, anon;
grant execute on function public.get_kagawad_action_item_summary(uuid) to authenticated;
