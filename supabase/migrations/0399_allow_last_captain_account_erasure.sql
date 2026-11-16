-- Allow a Captain account to be erased even when it is the last active Captain.
-- Memberships are still revoked and retained as audit/tenant history. Affected
-- barangays will have no active Captain until an administrator assigns one.

create or replace function public.handle_auth_user_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_email text := nullif(lower(trim(coalesce(old.email::text, ''))), '');
begin
  perform pg_catalog.pg_advisory_xact_lock(7306026::bigint);

  if exists (
    select 1 from public.platform_administrators administrator
    where administrator.user_id = old.id
  ) and not exists (
    select 1 from public.platform_administrators another_administrator
    where another_administrator.user_id <> old.id
  ) then
    raise exception 'Provision another platform administrator before deleting this account.';
  end if;

  if exists (
    select 1 from public.lgu_memberships target_membership
    where target_membership.user_id = old.id and target_membership.status = 'active'
      and not exists (
        select 1 from public.lgu_memberships remaining_membership
        where remaining_membership.lgu_id = target_membership.lgu_id
          and remaining_membership.user_id <> old.id and remaining_membership.status = 'active'
      )
  ) then
    raise exception 'Assign another active LGU administrator before deleting this account.';
  end if;

  delete from public.community_notifications where recipient_id = old.id;
  delete from public.community_notification_preferences where user_id = old.id;
  delete from public.meeting_invitation_responses where user_id = old.id;

  update public.barangay_memberships membership
  set status = case
    when exists (
      select 1 from public.platform_account_removal_events pending_removal
      where pending_removal.target_user_id = old.id and pending_removal.completed_at is null
    ) then 'suspended'
    else 'revoked'
  end
  where membership.user_id = old.id and membership.status <> 'revoked';

  update public.lgu_memberships
  set status = 'revoked'
  where user_id = old.id and status <> 'revoked';

  delete from public.membership_permissions permissions
  using public.barangay_memberships membership
  where permissions.membership_id = membership.id and membership.user_id = old.id;
  delete from public.platform_administrators where user_id = old.id;

  if v_deleted_email is not null then
    update public.invitations invitation
    set status = case when invitation.status = 'pending' then 'revoked' else invitation.status end,
        invited_email = ('deleted+' || replace(invitation.id::text, '-', '') || '@erased.invalid')::extensions.citext
    where lower(invitation.invited_email::text) = v_deleted_email;

    update public.lgu_invitations invitation
    set status = case when invitation.status = 'pending' then 'revoked' else invitation.status end,
        invited_email = ('deleted+' || replace(invitation.id::text, '-', '') || '@erased.invalid')::extensions.citext
    where lower(invitation.invited_email::text) = v_deleted_email;
  end if;

  delete from public.household_members household_member
  using public.residents resident
  where resident.user_id = old.id and household_member.resident_id = resident.id;

  update public.document_requests request
  set purpose = 'Information removed after account deletion',
      rejection_reason = case when request.status = 'rejected'
        then 'Information removed after account deletion' else null end
  where request.resident_id in (select resident.id from public.residents resident where resident.user_id = old.id);

  update public.resident_profile_change_requests request
  set proposed_first_name = 'Removed', proposed_last_name = null, proposed_phone = null,
      request_note = null, review_reason = null
  where request.resident_id in (select resident.id from public.residents resident where resident.user_id = old.id);

  update public.resident_profile_change_events event
  set reason = '[Reason removed after account deletion]'
  where event.actor_id = old.id and event.request_id in (
    select request.id from public.resident_profile_change_requests request
    where request.resident_id in (select resident.id from public.residents resident where resident.user_id = old.id)
  );

  update public.meeting_attendance_correction_requests
  set reason = 'Reason removed after account deletion', review_note = null
  where requester_id = old.id;

  update public.residency_verifications verification
  set reason = null
  where verification.resident_id in (select resident.id from public.residents resident where resident.user_id = old.id);

  update public.residents
  set user_id = null, first_name = 'Removed', middle_name = null, last_name = 'Resident',
      suffix = null, birth_date = null, phone = null, record_status = 'inactive', updated_at = now()
  where user_id = old.id;

  update public.support_tickets
  set subject = 'Content removed after account deletion',
      description = 'Requester content removed after account deletion.', updated_at = now()
  where requester_id = old.id;
  update public.support_messages
  set body = '[Message removed after account deletion]'
  where author_id = old.id;

  update public.community_feedback
  set subject = 'Feedback removed after account deletion',
      message = 'Feedback content removed after account deletion.',
      staff_response = case when staff_response is null then null
        else 'Response content removed after account deletion.' end,
      updated_at = now()
  where submitted_by = old.id;
  update public.community_feedback_events
  set note = '[Note removed after account deletion]'
  where actor_id = old.id;

  update public.platform_account_removal_events
  set target_name = 'Deleted account',
      target_email = 'deleted+' || replace(target_user_id::text, '-', '') || '@erased.invalid'
  where target_user_id = old.id;

  update public.profiles
  set display_name = 'Deleted account', deleted_at = coalesce(deleted_at, now()), updated_at = now()
  where id = old.id;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.handle_auth_user_deletion() from public, anon, authenticated;

-- The platform UI uses this RPC before calling Auth Admin deleteUser. It must
-- no longer reject the deletion of a sole Captain either.
create or replace function public.prepare_platform_captain_account_removal(
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_email text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(7306026::bigint);

  if exists (select 1 from public.platform_administrators where user_id = p_user_id) then
    raise exception 'platform administrator accounts cannot be removed here';
  end if;

  if exists (select 1 from public.platform_account_removal_events where target_user_id = p_user_id) then
    return;
  end if;

  if length(v_reason) not between 3 and 1000 then
    raise exception 'provide a reason for removing this Captain account';
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), 'Barangay Captain'),
         coalesce(auth_user.email::text, '')
    into v_name, v_email
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.id = p_user_id;
  if not found then raise exception 'Captain account was not found'; end if;

  if not exists (
    select 1 from public.barangay_memberships membership
    join public.role_definitions role on role.id = membership.role_id and role.key = 'captain'
    where membership.user_id = p_user_id and membership.status in ('active', 'suspended')
  ) then
    raise exception 'account is not an active or suspended Captain';
  end if;

  insert into public.platform_account_removal_events(target_user_id, actor_id, target_name, target_email, reason)
  values (p_user_id, (select auth.uid()), v_name, v_email, v_reason);

  with changed as (
    update public.barangay_memberships membership
    set status = 'suspended'
    where membership.user_id = p_user_id and membership.status = 'active'
    returning membership.id, membership.barangay_id, membership.role_id
  )
  insert into public.membership_access_events(
    barangay_id, membership_id, actor_id, action, from_role, to_role, from_status, to_status
  )
  select changed.barangay_id, changed.id, (select auth.uid()), 'status_changed', role.key, role.key, 'active', 'suspended'
  from changed join public.role_definitions role on role.id = changed.role_id;

  update public.invitations invitation
  set status = 'revoked'
  where invitation.status = 'pending'
    and lower(invitation.invited_email::text) = lower(v_email);
end;
$$;

revoke all on function public.prepare_platform_captain_account_removal(uuid, text) from public, anon;
grant execute on function public.prepare_platform_captain_account_removal(uuid, text) to authenticated;
