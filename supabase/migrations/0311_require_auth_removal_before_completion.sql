-- Do not let the service-only retry RPC mark removal complete while the Auth
-- identity is still active. The Edge Function calls this only after Auth has
-- hard-deleted the row or soft-deleted it by setting deleted_at.
create or replace function public.complete_platform_captain_account_removal(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;

  if exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_user_id
      and auth_user.deleted_at is null
  ) then
    raise exception 'Auth account is still active; removal cannot be completed';
  end if;

  update public.platform_account_removal_events
  set completed_at = coalesce(completed_at, now())
  where target_user_id = p_user_id;

  if not found then
    raise exception 'account removal was not prepared';
  end if;
end;
$$;

revoke all on function public.complete_platform_captain_account_removal(uuid) from public, anon, authenticated;
grant execute on function public.complete_platform_captain_account_removal(uuid) to service_role;
