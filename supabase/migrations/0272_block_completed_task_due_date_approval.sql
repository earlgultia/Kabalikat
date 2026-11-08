-- A pending due-date request may outlive the task's active work. Keep the
-- request reviewable, but do not let approval change a completed task.
create or replace function public.decide_committee_task_due_date_request(
  p_request_id uuid, p_decision text, p_decision_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.committee_task_due_date_requests%rowtype;
  v_task public.committee_tasks%rowtype;
  v_note text := trim(coalesce(p_decision_note, ''));
begin
  select request.* into v_request
  from public.committee_task_due_date_requests request
  where request.id = p_request_id for update;
  if not found then raise exception 'request not found'; end if;
  if not public.has_tenant_permission(v_request.barangay_id, 'committee.manage') then
    raise exception 'not authorized';
  end if;
  if v_request.status <> 'pending' then raise exception 'request has already been reviewed'; end if;
  if p_decision not in ('approved', 'declined') then raise exception 'invalid decision'; end if;
  if p_decision = 'declined' and length(v_note) not between 3 and 2000 then
    raise exception 'add a reason between 3 and 2000 characters when declining';
  end if;

  select task.* into v_task from public.committee_tasks task
  join public.committees committee on committee.id = task.committee_id and committee.barangay_id = task.barangay_id
  where task.id = v_request.task_id and committee.status = 'active'
  for update of task;
  if not found then raise exception 'task is no longer active'; end if;

  if p_decision = 'approved' then
    if v_task.status = 'completed' then
      raise exception 'completed tasks cannot have their due date changed';
    end if;
    if v_task.due_date is distinct from v_request.current_due_date then
      raise exception 'task due date changed after this request was submitted';
    end if;
    if v_request.proposed_due_date <= current_date then
      raise exception 'the proposed date has passed; ask the Kagawad to submit a new date';
    end if;
    update public.committee_tasks set due_date = v_request.proposed_due_date,
      updated_by = (select auth.uid()), updated_at = now() where id = v_task.id;
    insert into public.committee_events(barangay_id, committee_id, task_id, actor_id, action, details)
    values (v_task.barangay_id, v_task.committee_id, v_task.id, (select auth.uid()), 'task_due_date_changed',
      coalesce(v_task.due_date::text, 'No due date') || ' -> ' || v_request.proposed_due_date::text);
    v_note := concat('Due-date change approved: ', v_request.proposed_due_date::text,
      case when v_note <> '' then '. ' || v_note else '.' end);
  else
    v_note := 'Due-date change declined. ' || v_note;
  end if;

  update public.committee_task_due_date_requests
  set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now(), decision_note = v_note
  where id = v_request.id;

  if exists (select 1 from public.barangay_memberships membership
    where membership.barangay_id = v_task.barangay_id and membership.user_id = v_request.requester_id
      and membership.status = 'active') then
    insert into public.committee_task_progress_notes(barangay_id, committee_id, task_id, author_id, note)
    values (v_task.barangay_id, v_task.committee_id, v_task.id, (select auth.uid()), left(v_note, 2000));
  end if;

  update public.community_notifications set read_at = coalesce(read_at, now())
  where recipient_id = (select auth.uid()) and resource_type = 'committee_due_date_request'
    and resource_id = v_request.id and read_at is null;
end;
$$;

revoke all on function public.decide_committee_task_due_date_request(uuid, text, text) from public, anon;
grant execute on function public.decide_committee_task_due_date_request(uuid, text, text) to authenticated;
