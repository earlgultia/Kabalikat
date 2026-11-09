-- Hide task notifications and notification-linked task details when the
-- barangay's Community Programs entitlement is disabled.
create or replace function public.can_access_committee_task_update_notification(
  p_task_id uuid,
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
      from public.committee_tasks task
      join public.committees committee
        on committee.id = task.committee_id
       and committee.barangay_id = task.barangay_id
      where task.id = p_task_id
        and task.barangay_id = p_barangay_id
        and committee.status = 'active'
        and (
          task.assigned_to = (select auth.uid())
          or public.has_tenant_permission(p_barangay_id, 'committee.manage')
        )
        and exists (
          select 1 from public.committee_task_progress_notes note
          where note.task_id = task.id
            and note.author_id <> (select auth.uid())
        )
    );
$$;

create or replace function public.can_access_committee_task_assignment_notification(
  p_task_id uuid,
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
      from public.committee_tasks task
      join public.committees committee
        on committee.id = task.committee_id
       and committee.barangay_id = task.barangay_id
      where task.id = p_task_id
        and task.barangay_id = p_barangay_id
        and task.assigned_to = (select auth.uid())
        and committee.status = 'active'
    );
$$;

create or replace function public.can_access_committee_due_date_decision_notification(
  p_task_id uuid,
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
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    )
    and exists (
      select 1
      from public.committee_task_due_date_requests request
      join public.committees committee
        on committee.id = request.committee_id
       and committee.barangay_id = request.barangay_id
      where request.task_id = p_task_id
        and request.barangay_id = p_barangay_id
        and request.requester_id = (select auth.uid())
        and request.status in ('approved', 'declined')
        and committee.status = 'active'
    );
$$;

revoke all on function public.can_access_committee_task_update_notification(uuid, uuid)
  from public, anon;
revoke all on function public.can_access_committee_task_assignment_notification(uuid, uuid)
  from public, anon;
revoke all on function public.can_access_committee_due_date_decision_notification(uuid, uuid)
  from public, anon;
grant execute on function public.can_access_committee_task_update_notification(uuid, uuid)
  to authenticated;
grant execute on function public.can_access_committee_task_assignment_notification(uuid, uuid)
  to authenticated;
grant execute on function public.can_access_committee_due_date_decision_notification(uuid, uuid)
  to authenticated;

-- Keep the existing task-context implementation intact, but place a gated
-- wrapper in front of it. The renamed implementation is no longer callable
-- by API roles directly.
alter function public.get_committee_task_notification_context(uuid)
  rename to get_committee_task_notification_context_unchecked;
revoke all on function public.get_committee_task_notification_context_unchecked(uuid)
  from public, anon, authenticated;

create function public.get_committee_task_notification_context(p_task_id uuid)
returns table (
  id uuid,
  committee_id uuid,
  committee_name text,
  title text,
  description text,
  status text,
  due_date date,
  can_add_note boolean,
  can_respond boolean,
  can_view_due_date_history boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
begin
  select task.barangay_id into v_barangay_id
  from public.committee_tasks task
  where task.id = p_task_id;

  if v_barangay_id is null
    or not public.tenant_plan_feature_enabled(v_barangay_id, 'community_programs') then
    return;
  end if;

  return query
  select context.id, context.committee_id, context.committee_name,
    context.title, context.description, context.status, context.due_date,
    context.can_add_note, context.can_respond, context.can_view_due_date_history
  from public.get_committee_task_notification_context_unchecked(p_task_id) context;
end;
$$;

revoke all on function public.get_committee_task_notification_context(uuid)
  from public, anon;
grant execute on function public.get_committee_task_notification_context(uuid)
  to authenticated;
