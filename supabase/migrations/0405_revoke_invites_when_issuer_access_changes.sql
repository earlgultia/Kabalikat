-- Invitations become unusable when their issuer loses the role that granted
-- authority to issue them. Revoke pending links immediately so the invitation
-- list and its audit history reflect that change as well.

create or replace function public.revoke_pending_invites_after_issuer_access_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active'
    and (new.status is distinct from 'active' or new.role_id is distinct from old.role_id) then
    update public.invitations as invitation
    set status = 'revoked'
    where invitation.barangay_id = new.barangay_id
      and invitation.invited_by = new.user_id
      and invitation.status = 'pending';
  end if;

  return new;
end;
$$;

revoke all on function public.revoke_pending_invites_after_issuer_access_change() from public, anon, authenticated;

create trigger revoke_invites_after_issuer_access_change
after update of status, role_id on public.barangay_memberships
for each row execute function public.revoke_pending_invites_after_issuer_access_change();
