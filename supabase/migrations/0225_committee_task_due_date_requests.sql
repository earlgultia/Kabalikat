-- Let assigned Kagawads request due-date changes and committee managers review
-- them through tenant-scoped RPCs. Direct table access stays disabled.
create table public.committee_task_due_date_requests (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  committee_id uuid not null,
  task_id uuid not null references public.committee_tasks(id) on delete restrict,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  current_due_date date,
  proposed_due_date date not null,
  reason text not null check (length(trim(reason)) between 3 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (committee_id, barangay_id) references public.committees(id, barangay_id) on delete restrict,
  check (proposed_due_date > created_at::date),
  check ((status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null))
);

create unique index committee_task_due_date_one_pending_idx
  on public.committee_task_due_date_requests(task_id) where status = 'pending';
create index committee_task_due_date_manager_queue_idx
  on public.committee_task_due_date_requests(barangay_id, created_at desc, id desc) where status = 'pending';
create index committee_task_due_date_requester_history_idx
  on public.committee_task_due_date_requests(task_id, requester_id, created_at desc, id desc);

alter table public.committee_task_due_date_requests enable row level security;
revoke all on public.committee_task_due_date_requests from public, anon, authenticated;

alter table public.committee_events drop constraint if exists committee_events_action_check;
alter table public.committee_events add constraint committee_events_action_check
  check (action in ('committee_created', 'member_assigned', 'task_created', 'task_status_changed', 'task_due_date_changed'));

create or replace function public.list_kagawad_task_due_date_request(p_task_id uuid)
returns table (
  id uuid, current_due_date date, proposed_due_date date, reason text,
  status text, decision_note text, created_at timestamptz, reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.committee_tasks task
    join public.committees committee on committee.id = task.committee_id and committee.barangay_id = task.barangay_id
    join public.barangay_memberships membership on membership.barangay_id = task.barangay_id
      and membership.user_id = (select auth.uid()) and membership.status = 'active'
    join public.role_definitions role on role.id = membership.role_id
    where task.id = p_task_id and task.assigned_to = (select auth.uid())
      and committee.status = 'active' and role.key = 'kagawad'
  ) then raise exception 'not authorized'; end if;

  return query
  select request.id, request.current_due_date, request.proposed_due_date,
    request.reason, request.status, request.decision_note, request.created_at, request.reviewed_at
  from public.committee_task_due_date_requests request
  where request.task_id = p_task_id and request.requester_id = (select auth.uid())
  order by request.created_at desc, request.id desc limit 1;
end;
$$;

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
      left join public.membership_permissions override on override.membership_id = membership.id
        and override.permission_id = permission.id
      where role_permission.role_id = membership.role_id and coalesce(override.effect, 'allow') = 'allow'
    )
  on conflict (recipient_id, resource_type, resource_id) do nothing;
  return v_request_id;
end;
$$;

create or replace function public.list_committee_task_due_date_requests(
  p_barangay_id uuid, p_page integer default 0, p_page_size integer default 20
)
returns table (
  id uuid, task_id uuid, task_title text, committee_name text,
  current_due_date date, proposed_due_date date, reason text,
  requester_name text, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
begin
  if not public.has_tenant_permission(p_barangay_id, 'committee.manage') then
    raise exception 'not authorized';
  end if;

  return query
  with requests as (
    select request.id, task.id as task_id, task.title as task_title,
      committee.name as committee_name, request.current_due_date, request.proposed_due_date,
      request.reason, coalesce(nullif(profile.display_name, ''), 'Kagawad')::text as requester_name,
      request.created_at
    from public.committee_task_due_date_requests request
    join public.committee_tasks task on task.id = request.task_id and task.barangay_id = request.barangay_id
    join public.committees committee on committee.id = request.committee_id and committee.barangay_id = request.barangay_id
    left join public.profiles profile on profile.id = request.requester_id
    where request.barangay_id = p_barangay_id and request.status = 'pending' and committee.status = 'active'
  ), counted as (
    select requests.*, count(*) over () as total_count from requests
  )
  select counted.id, counted.task_id, counted.task_title, counted.committee_name,
    counted.current_due_date, counted.proposed_due_date, counted.reason,
    counted.requester_name, counted.created_at, counted.total_count
  from counted order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;

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

alter table public.community_notifications drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement', 'disaster_advisory', 'resident_profile_change', 'document_request',
    'community_feedback', 'meeting_update', 'meeting_resolution', 'health_outreach_cancellation',
    'health_outreach_completion', 'health_outreach_review', 'health_outreach_published',
    'health_outreach_review_submission', 'health_outreach_rescheduled', 'sk_event_review_submission',
    'sk_event_published', 'sk_event_review_feedback', 'sk_event_cancelled', 'sk_event_rescheduled',
    'sk_event_completed', 'incident_assignment', 'incident_status_change', 'patrol_shift_assignment',
    'patrol_shift_cancelled', 'patrol_shift_rescheduled', 'patrol_shift_started', 'patrol_shift_completed',
    'support_ticket_update', 'committee_task_update', 'committee_task_progress', 'committee_due_date_request'
  ));

create or replace function public.can_access_committee_due_date_request_notification(
  p_request_id uuid, p_barangay_id uuid
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_active_member(p_barangay_id)
    and public.has_tenant_permission(p_barangay_id, 'committee.manage')
    and exists (select 1 from public.committee_task_due_date_requests request
      join public.committees committee on committee.id = request.committee_id and committee.barangay_id = request.barangay_id
      where request.id = p_request_id and request.barangay_id = p_barangay_id and committee.status = 'active');
$$;

create policy community_notifications_committee_due_date_request_read on public.community_notifications
  for select to authenticated using (recipient_id = (select auth.uid())
    and resource_type = 'committee_due_date_request'
    and public.can_access_committee_due_date_request_notification(resource_id, barangay_id));
create policy community_notifications_committee_due_date_request_mark_read on public.community_notifications
  for update to authenticated using (recipient_id = (select auth.uid()) and read_at is null
    and resource_type = 'committee_due_date_request'
    and public.can_access_committee_due_date_request_notification(resource_id, barangay_id))
  with check (recipient_id = (select auth.uid()) and read_at is not null
    and resource_type = 'committee_due_date_request'
    and public.can_access_committee_due_date_request_notification(resource_id, barangay_id));

revoke all on function public.list_kagawad_task_due_date_request(uuid) from public, anon;
revoke all on function public.request_committee_task_due_date(uuid, date, text) from public, anon;
revoke all on function public.list_committee_task_due_date_requests(uuid, integer, integer) from public, anon;
revoke all on function public.decide_committee_task_due_date_request(uuid, text, text) from public, anon;
revoke all on function public.can_access_committee_due_date_request_notification(uuid, uuid) from public, anon;
grant execute on function public.list_kagawad_task_due_date_request(uuid) to authenticated;
grant execute on function public.request_committee_task_due_date(uuid, date, text) to authenticated;
grant execute on function public.list_committee_task_due_date_requests(uuid, integer, integer) to authenticated;
grant execute on function public.decide_committee_task_due_date_request(uuid, text, text) to authenticated;
grant execute on function public.can_access_committee_due_date_request_notification(uuid, uuid) to authenticated;
