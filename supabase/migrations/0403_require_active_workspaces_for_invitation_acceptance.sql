-- Do not create or accept invitations while the target workspace is inactive.
-- Keep these checks at the table boundary as well as in the RPCs so callers
-- cannot bypass them with another SECURITY DEFINER function.

create or replace function public.guard_barangay_invitation_workspace_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barangay_status text;
  v_lgu_id uuid;
  v_lgu_status text;
  v_check_workspace boolean := false;
begin
  if tg_op = 'INSERT' then
    v_check_workspace := new.status = 'pending';
  elsif new.status = 'accepted' and old.status is distinct from 'accepted' then
    v_check_workspace := true;
  end if;

  if not v_check_workspace then
    return new;
  end if;

  select barangay.status, barangay.lgu_id, lgu.status
    into v_barangay_status, v_lgu_id, v_lgu_status
  from public.barangays as barangay
  left join public.local_government_units as lgu on lgu.id = barangay.lgu_id
  where barangay.id = new.barangay_id;

  if not found or v_barangay_status is distinct from 'active' then
    raise exception 'the Barangay workspace is not active';
  end if;

  if v_lgu_id is not null and v_lgu_status is distinct from 'active' then
    raise exception 'the municipality LGU workspace is not active';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_barangay_invitation_workspace_status() from public, anon, authenticated;

create trigger invitations_require_active_workspace
before insert or update on public.invitations
for each row execute function public.guard_barangay_invitation_workspace_status();

create or replace function public.guard_lgu_invitation_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lgu_status text;
  v_check_authority boolean := false;
begin
  if tg_op = 'INSERT' then
    v_check_authority := new.status = 'pending';
  elsif new.status = 'accepted' and old.status is distinct from 'accepted' then
    v_check_authority := true;
  end if;

  if not v_check_authority then
    return new;
  end if;

  select lgu.status into v_lgu_status
  from public.local_government_units as lgu
  where lgu.id = new.lgu_id;

  if not found or v_lgu_status is distinct from 'active' then
    raise exception 'the municipality LGU workspace is not active';
  end if;

  if not exists (
    select 1 from public.platform_administrators as administrator
    where administrator.user_id = new.invited_by
  ) then
    raise exception 'only a Super Admin can issue an LGU administrator invitation';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_lgu_invitation_authority() from public, anon, authenticated;

create trigger lgu_invitations_require_active_super_admin
before insert or update on public.lgu_invitations
for each row execute function public.guard_lgu_invitation_authority();
