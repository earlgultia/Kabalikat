-- A suspended or archived Barangay must not retain pending member links that
-- could become usable again if the workspace is later reactivated.

create or replace function public.revoke_pending_invites_after_barangay_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status is distinct from 'active' then
    update public.invitations as invitation
    set status = 'revoked'
    where invitation.barangay_id = new.id
      and invitation.status = 'pending';
  end if;

  return new;
end;
$$;

revoke all on function public.revoke_pending_invites_after_barangay_status_change() from public, anon, authenticated;

create trigger revoke_barangay_invites_after_workspace_status_change
after update of status on public.barangays
for each row execute function public.revoke_pending_invites_after_barangay_status_change();

-- Acquire workspace locks before the existing invitation guard checks status.
-- If a suspension wins the lock, creation sees the inactive workspace and
-- fails. If creation wins, the suspension trigger revokes that pending invite.
create or replace function public.lock_invitation_workspace_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lgu_id uuid;
  v_workspace_id uuid;
begin
  select barangay.id, barangay.lgu_id
    into v_workspace_id, v_lgu_id
  from public.barangays as barangay
  where barangay.id = new.barangay_id
  for share;

  if v_workspace_id is null then
    return new;
  end if;

  if v_lgu_id is not null then
    perform lgu.id
    from public.local_government_units as lgu
    where lgu.id = v_lgu_id
    for share;
  end if;

  return new;
end;
$$;

revoke all on function public.lock_invitation_workspace_rows() from public, anon, authenticated;

create trigger a_lock_invitation_workspace_rows
before insert on public.invitations
for each row execute function public.lock_invitation_workspace_rows();
