-- Resolve a task notification to the minimum task details needed by its
-- current assignee or an active committee manager.
create or replace function public.get_committee_task_notification_context(p_task_id uuid)
returns table (
  id uuid,
  committee_id uuid,
  committee_name text,
  title text,
  description text,
  status text,
  due_date date,
  can_add_note boolean,
  can_respond boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select task.id, committee.id, committee.name, task.title,
    coalesce(task.description, ''), task.status::text, task.due_date,
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
  from public.committee_tasks task
  join public.committees committee
    on committee.id = task.committee_id
   and committee.barangay_id = task.barangay_id
  where task.id = p_task_id
    and committee.status = 'active'
    and public.is_active_member(task.barangay_id)
    and (
      (task.assigned_to = (select auth.uid()) and exists (
        select 1
        from public.barangay_memberships membership
        join public.role_definitions role on role.id = membership.role_id
        where membership.barangay_id = task.barangay_id
          and membership.user_id = (select auth.uid())
          and membership.status = 'active'
          and role.key = 'kagawad'
      ))
      or public.has_tenant_permission(task.barangay_id, 'committee.manage')
    );
$$;

revoke all on function public.get_committee_task_notification_context(uuid) from public, anon;
grant execute on function public.get_committee_task_notification_context(uuid) to authenticated;
