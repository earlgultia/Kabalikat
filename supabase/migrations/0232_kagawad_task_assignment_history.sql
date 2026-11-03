-- Preserve each task assignment so Kagawads can still review work after it
-- is transferred or the committee is archived.
create table public.committee_task_assignment_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  committee_id uuid not null,
  task_id uuid not null references public.committee_tasks(id) on delete restrict,
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  foreign key (committee_id, barangay_id)
    references public.committees(id, barangay_id) on delete restrict
);

create index committee_task_assignment_events_user_history_idx
  on public.committee_task_assignment_events(barangay_id, assigned_to, assigned_at desc, id desc);

alter table public.committee_task_assignment_events enable row level security;
revoke all on public.committee_task_assignment_events from public, anon, authenticated;

create or replace function public.log_committee_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.assigned_to is not distinct from new.assigned_to then
      return new;
    end if;
  end if;

  insert into public.committee_task_assignment_events(
    barangay_id, committee_id, task_id, assigned_to
  ) values (
    new.barangay_id, new.committee_id, new.id, new.assigned_to
  );
  return new;
end;
$$;

revoke all on function public.log_committee_task_assignment() from public, anon, authenticated;

create trigger committee_task_assignment_insert_history
  after insert on public.committee_tasks
  for each row execute function public.log_committee_task_assignment();

create trigger committee_task_assignment_update_history
  after update of assigned_to on public.committee_tasks
  for each row when (old.assigned_to is distinct from new.assigned_to)
  execute function public.log_committee_task_assignment();

-- Backfill assignments that are active when this migration is installed.
insert into public.committee_task_assignment_events(
  barangay_id, committee_id, task_id, assigned_to, assigned_at
)
select task.barangay_id, task.committee_id, task.id, task.assigned_to, task.created_at
from public.committee_tasks task
where task.assigned_to is not null
  and not exists (
    select 1 from public.committee_task_assignment_events event
    where event.task_id = task.id and event.assigned_to = task.assigned_to
  );

create or replace function public.list_kagawad_task_assignment_history(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10
)
returns table (
  id uuid,
  task_id uuid,
  committee_name text,
  task_title text,
  task_status text,
  due_date date,
  assigned_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
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

  return query
  with history as (
    select event.id, task.id as task_id, committee.name as committee_name,
      task.title as task_title, task.status::text as task_status,
      task.due_date, event.assigned_at
    from public.committee_task_assignment_events event
    join public.committee_tasks task
      on task.id = event.task_id and task.barangay_id = event.barangay_id
    join public.committees committee
      on committee.id = event.committee_id and committee.barangay_id = event.barangay_id
    where event.barangay_id = p_barangay_id
      and event.assigned_to = (select auth.uid())
  ), counted as (
    select history.*, count(*) over () as total_count from history
  )
  select counted.id, counted.task_id, counted.committee_name, counted.task_title,
    counted.task_status, counted.due_date, counted.assigned_at, counted.total_count
  from counted
  order by counted.assigned_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_kagawad_task_assignment_history(uuid, integer, integer) from public, anon;
grant execute on function public.list_kagawad_task_assignment_history(uuid, integer, integer) to authenticated;
