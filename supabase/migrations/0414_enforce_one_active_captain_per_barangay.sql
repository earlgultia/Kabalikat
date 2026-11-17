-- Serialize Captain activation per Barangay and prevent duplicate active
-- Captains through any invitation or privileged database write path.
create or replace function public.guard_single_active_barangay_captain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_captain_role_id uuid;
begin
  select role.id into v_captain_role_id
  from public.role_definitions as role
  where role.key = 'captain' and role.scope = 'barangay';

  if new.status <> 'active' or new.role_id is distinct from v_captain_role_id then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'active'
     and old.role_id = new.role_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.barangay_id::text, 41401));

  if exists (
    select 1
    from public.barangay_memberships as membership
    where membership.barangay_id = new.barangay_id
      and membership.status = 'active'
      and membership.role_id = v_captain_role_id
      and (tg_op <> 'UPDATE' or membership.id <> old.id)
  ) then
    raise exception 'this Barangay already has an active Captain';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_single_active_barangay_captain() from public, anon, authenticated;

create index if not exists barangay_memberships_active_role_idx
  on public.barangay_memberships (barangay_id, role_id)
  where status = 'active';

create trigger barangay_memberships_single_active_captain
before insert or update of role_id, status on public.barangay_memberships
for each row execute function public.guard_single_active_barangay_captain();
