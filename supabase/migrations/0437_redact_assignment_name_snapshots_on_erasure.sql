-- Retain committee task assignment history while removing copied profile names.
create or replace function public.redact_assignment_name_snapshots_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.committee_task_assignment_events event
  set assigned_by_name = case when event.assigned_by = old.id
        then 'Deleted account' else event.assigned_by_name end,
      previous_assignee_name = case when event.previous_assignee = old.id
        then 'Deleted account' else event.previous_assignee_name end
  where event.assigned_by = old.id
     or event.previous_assignee = old.id;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_assignment_name_snapshots_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_assignment_name_snapshot_redaction on auth.users;
create trigger on_auth_user_assignment_name_snapshot_redaction
  before delete on auth.users
  for each row execute function public.redact_assignment_name_snapshots_before_auth_deletion();

drop trigger if exists on_auth_user_assignment_name_snapshot_soft_redaction on auth.users;
create trigger on_auth_user_assignment_name_snapshot_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_assignment_name_snapshots_before_auth_deletion();
