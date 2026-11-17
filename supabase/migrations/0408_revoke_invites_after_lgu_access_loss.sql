-- Revoke pending child invitations when the LGU administrator or workspace
-- that issued/enabled them loses access. Existing invitation audit rows are
-- updated by the barangay invitation audit trigger where one is available.

create or replace function public.revoke_lgu_admin_captain_invites_on_access_loss()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_captain_role_id uuid;
begin
  if old.status = 'active' and new.status is distinct from 'active' then
    select role.id into v_captain_role_id
    from public.role_definitions as role
    where role.key = 'captain' and role.scope = 'barangay';

    update public.invitations as invitation
    set status = 'revoked'
    where invitation.invited_by = new.user_id
      and invitation.role_id = v_captain_role_id
      and invitation.status = 'pending'
      and exists (
        select 1 from public.barangays as barangay
        where barangay.id = invitation.barangay_id
          and barangay.lgu_id = new.lgu_id
      );
  end if;

  return new;
end;
$$;

revoke all on function public.revoke_lgu_admin_captain_invites_on_access_loss() from public, anon, authenticated;

create trigger revoke_lgu_captain_invites_after_admin_access_loss
after update of status on public.lgu_memberships
for each row execute function public.revoke_lgu_admin_captain_invites_on_access_loss();

create or replace function public.revoke_barangay_invites_after_lgu_suspension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status is distinct from 'active' then
    update public.invitations as invitation
    set status = 'revoked'
    where invitation.status = 'pending'
      and exists (
        select 1 from public.barangays as barangay
        where barangay.id = invitation.barangay_id
          and barangay.lgu_id = new.id
      );
  end if;

  return new;
end;
$$;

revoke all on function public.revoke_barangay_invites_after_lgu_suspension() from public, anon, authenticated;

create trigger revoke_barangay_invites_after_lgu_suspension
after update of status on public.local_government_units
for each row execute function public.revoke_barangay_invites_after_lgu_suspension();

create or replace function public.revoke_lgu_invites_after_super_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lgu_invitations as invitation
  set status = 'revoked'
  where invitation.invited_by = old.user_id
    and invitation.status = 'pending';
  return old;
end;
$$;

revoke all on function public.revoke_lgu_invites_after_super_admin_removal() from public, anon, authenticated;

create trigger revoke_lgu_invites_after_super_admin_removal
after delete on public.platform_administrators
for each row execute function public.revoke_lgu_invites_after_super_admin_removal();
