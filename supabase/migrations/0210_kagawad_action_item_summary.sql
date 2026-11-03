-- Give Kagawads a private, actionable summary of the committee tasks assigned to them.
create index if not exists committee_tasks_assignee_follow_up_idx
  on public.committee_tasks(barangay_id, assigned_to, status, due_date)
  where assigned_to is not null;

create or replace function public.get_kagawad_action_item_summary(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_open bigint;
  v_in_progress bigint;
  v_blocked bigint;
  v_overdue bigint;
begin
  if not public.is_active_member(p_barangay_id)
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
    count(*) filter (where task.status <> 'completed' and task.due_date < current_date)
  into v_open, v_in_progress, v_blocked, v_overdue
  from public.committee_tasks task
  join public.committees committee
    on committee.id = task.committee_id
   and committee.barangay_id = task.barangay_id
  where task.barangay_id = p_barangay_id
    and task.assigned_to = (select auth.uid())
    and committee.status = 'active';

  return jsonb_build_object(
    'open_action_items', v_open,
    'in_progress_action_items', v_in_progress,
    'blocked_action_items', v_blocked,
    'overdue_action_items', v_overdue,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_kagawad_action_item_summary(uuid) from public, anon;
grant execute on function public.get_kagawad_action_item_summary(uuid) to authenticated;
