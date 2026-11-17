-- Remove the erased resident's household link. If that was the household's
-- last remaining resident/member reference, redact the now-unshared address.
create or replace function public.redact_erased_member_household_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_ids uuid[];
begin
  select array_agg(distinct resident.household_id)
    into v_household_ids
  from public.residents resident
  where resident.user_id = old.id
    and resident.household_id is not null;

  delete from public.household_members member
  using public.residents resident
  where resident.user_id = old.id
    and member.resident_id = resident.id;

  update public.residents
  set household_id = null,
      updated_at = now()
  where user_id = old.id
    and household_id is not null;

  if v_household_ids is not null then
    update public.households household
    set address_line = '[Address removed after account deletion]',
        purok = null,
        updated_at = now()
    where household.id = any(v_household_ids)
      and not exists (
        select 1 from public.residents resident
        where resident.household_id = household.id
      )
      and not exists (
        select 1 from public.household_members member
        where member.household_id = household.id
      );
  end if;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_erased_member_household_identity()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_household_identity_redaction on auth.users;
create trigger on_auth_user_household_identity_redaction
  before delete on auth.users
  for each row execute function public.redact_erased_member_household_identity();

drop trigger if exists on_auth_user_household_identity_soft_redaction on auth.users;
create trigger on_auth_user_household_identity_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_erased_member_household_identity();
