-- Make unfinished work available for reassignment after a member loses access.
-- Historical records and the original actor references remain intact.
create or replace function public.release_open_work_from_erased_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.incidents incident
  set assigned_to = null,
      updated_at = pg_catalog.now()
  where incident.assigned_to = old.id
    and incident.status in ('submitted', 'acknowledged', 'in_progress');

  update public.committee_tasks task
  set assigned_to = null,
      updated_at = pg_catalog.now()
  where task.assigned_to = old.id
    and task.status in ('open', 'in_progress', 'blocked');

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.release_open_work_from_erased_member()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_release_open_work on auth.users;
create trigger on_auth_user_release_open_work
  before delete on auth.users
  for each row execute function public.release_open_work_from_erased_member();

drop trigger if exists on_auth_user_release_open_work_soft on auth.users;
create trigger on_auth_user_release_open_work_soft
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.release_open_work_from_erased_member();

create index if not exists committee_tasks_assignee_erasure_idx
  on public.committee_tasks (assigned_to)
  where assigned_to is not null;
