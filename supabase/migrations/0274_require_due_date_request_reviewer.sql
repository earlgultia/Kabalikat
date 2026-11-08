-- Reject due-date requests that would have no manager recipient, and return
-- a clear message instead of relying on the partial unique index for repeats.
create or replace function public.request_committee_task_due_date(
  p_task_id uuid, p_proposed_due_date date, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.committee_tasks%rowtype;
  v_request_id uuid;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select task.* into v_task
  from public.committee_tasks task
  join public.committees committee on committee.id = task.committee_id and committee.barangay_id = task.barangay_id
  join public.barangay_memberships membership on membership.barangay_id = task.barangay_id
    and membership.user_id = (select auth.uid()) and membership.status = 'active'
  join public.role_definitions role on role.id = membership.role_id
  where task.id = p_task_id and task.assigned_to = (select auth.uid())
    and committee.status = 'active' and role.key = 'kagawad'
  for update of task;

  if not found then raise exception 'task not found or not authorized'; end if;
  if v_task.status = 'completed' then raise exception 'completed tasks cannot request a due-date change'; end if;
  if p_proposed_due_date is null or p_proposed_due_date <= current_date
    or p_proposed_due_date is not distinct from v_task.due_date then
    raise exception 'choose a different future due date';
  end if;
  if length(v_reason) not between 3 and 2000 then
    raise exception 'request reason must be between 3 and 2000 characters';
  end if;
  if exists (
    select 1 from public.committee_task_due_date_requests request
    where request.task_id = v_task.id and request.status = 'pending'
  ) then
    raise exception 'a due-date request is already awaiting review';
  end if;
  if not exists (
    select 1 from public.barangay_memberships membership
    where membership.barangay_id = v_task.barangay_id
      and membership.status = 'active'
      and membership.user_id <> (select auth.uid())
      and exists (
        select 1 from public.role_permissions role_permission
        join public.permissions permission on permission.id = role_permission.permission_id
          and permission.key = 'committee.manage'
        left join public.membership_permissions permission_override
          on permission_override.membership_id = membership.id
          and permission_override.permission_id = permission.id
        where role_permission.role_id = membership.role_id
          and coalesce(permission_override.effect, 'allow') = 'allow'
      )
  ) then
    raise exception 'no other active committee manager is available to review this request';
  end if;

  insert into public.committee_task_due_date_requests(
    barangay_id, committee_id, task_id, requester_id, current_due_date, proposed_due_date, reason
  ) values (
    v_task.barangay_id, v_task.committee_id, v_task.id, (select auth.uid()),
    v_task.due_date, p_proposed_due_date, v_reason
  ) returning id into v_request_id;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select v_task.barangay_id, membership.user_id, 'committee_due_date_request', v_request_id
  from public.barangay_memberships membership
  where membership.barangay_id = v_task.barangay_id and membership.status = 'active'
    and membership.user_id <> (select auth.uid())
    and exists (
      select 1 from public.role_permissions role_permission
      join public.permissions permission on permission.id = role_permission.permission_id
        and permission.key = 'committee.manage'
      left join public.membership_permissions permission_override
        on permission_override.membership_id = membership.id
        and permission_override.permission_id = permission.id
      where role_permission.role_id = membership.role_id
        and coalesce(permission_override.effect, 'allow') = 'allow'
    )
  on conflict (recipient_id, resource_type, resource_id) do nothing;
  return v_request_id;
end;
$$;

revoke all on function public.request_committee_task_due_date(uuid, date, text) from public, anon;
grant execute on function public.request_committee_task_due_date(uuid, date, text) to authenticated;
