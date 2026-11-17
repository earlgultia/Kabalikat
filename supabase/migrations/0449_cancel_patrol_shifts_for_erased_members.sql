-- Do not leave future patrol work scheduled against an erased account.
-- Keep the shift and its original assignee reference for operational history.
create or replace function public.cancel_patrol_shifts_for_erased_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.patrol_shifts shift
  set status = 'cancelled',
      cancelled_at = pg_catalog.now(),
      cancellation_note = 'Cancelled automatically after the assigned account was erased',
      updated_at = pg_catalog.now()
  where shift.assigned_to = old.id
    and shift.status = 'scheduled';

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.cancel_patrol_shifts_for_erased_member()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_cancel_patrol_shifts on auth.users;
create trigger on_auth_user_cancel_patrol_shifts
  before delete on auth.users
  for each row execute function public.cancel_patrol_shifts_for_erased_member();

drop trigger if exists on_auth_user_cancel_patrol_shifts_soft on auth.users;
create trigger on_auth_user_cancel_patrol_shifts_soft
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.cancel_patrol_shifts_for_erased_member();
