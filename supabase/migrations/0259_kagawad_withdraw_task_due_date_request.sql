-- Preserve pending due-date requests in history when their Kagawad requester
-- withdraws them, while removing their alert from the manager's unread queue.
alter table public.committee_task_due_date_requests
  drop constraint if exists committee_task_due_date_requests_status_check;

alter table public.committee_task_due_date_requests
  add constraint committee_task_due_date_requests_status_check
  check (status in ('pending', 'approved', 'declined', 'withdrawn'));

create or replace function public.withdraw_committee_task_due_date_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.committee_task_due_date_requests%rowtype;
begin
  select request.* into v_request
  from public.committee_task_due_date_requests request
  join public.committees committee
    on committee.id = request.committee_id
   and committee.barangay_id = request.barangay_id
  where request.id = p_request_id
    and request.requester_id = (select auth.uid())
    and committee.status = 'active'
  for update of request;

  if not found then
    raise exception 'not authorized';
  end if;

  if not public.is_active_member(v_request.barangay_id)
    or not exists (
      select 1
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = v_request.barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    ) then
    raise exception 'not authorized';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'only a pending due-date request can be withdrawn';
  end if;

  update public.committee_task_due_date_requests request
  set status = 'withdrawn',
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      decision_note = 'Withdrawn by requester'
  where request.id = v_request.id;

  update public.community_notifications notification
  set read_at = coalesce(notification.read_at, now())
  where notification.resource_type = 'committee_due_date_request'
    and notification.resource_id = v_request.id
    and notification.read_at is null;
end;
$$;

revoke all on function public.withdraw_committee_task_due_date_request(uuid) from public, anon;
grant execute on function public.withdraw_committee_task_due_date_request(uuid) to authenticated;
