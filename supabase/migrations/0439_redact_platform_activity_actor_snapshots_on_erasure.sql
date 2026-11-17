-- Preserve platform activity audit rows while removing copied administrator names.
create or replace function public.redact_platform_activity_actor_snapshot_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.platform_activity_events event
  set actor_name = 'Deleted account'
  where event.actor_id = old.id;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_platform_activity_actor_snapshot_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_platform_activity_actor_redaction on auth.users;
create trigger on_auth_user_platform_activity_actor_redaction
  before delete on auth.users
  for each row execute function public.redact_platform_activity_actor_snapshot_before_auth_deletion();

drop trigger if exists on_auth_user_platform_activity_actor_soft_redaction on auth.users;
create trigger on_auth_user_platform_activity_actor_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_platform_activity_actor_snapshot_before_auth_deletion();
