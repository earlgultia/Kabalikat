-- Erase user-specific personal data when Supabase hard-deletes an Auth user or
-- marks it deleted_at. Keep barangay operations and audit history, but revoke
-- access, redact private account content, and leave shared actor references on
-- the anonymized profiles tombstone.
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
    select 1
    from public.barangay_memberships target_membership
    join public.role_definitions target_role
      on target_role.id = target_membership.role_id and target_role.key = 'captain'
    where target_membership.user_id = old.id
      and (target_membership.status = 'active' or exists (
        select 1 from public.platform_account_removal_events pending_removal
        where pending_removal.target_user_id = old.id and pending_removal.completed_at is null
      ))
      and not exists (
        select 1 from public.barangay_memberships remaining_membership
        join public.role_definitions remaining_role
          on remaining_role.id = remaining_membership.role_id and remaining_role.key = 'captain'
        where remaining_membership.barangay_id = target_membership.barangay_id
          and remaining_membership.user_id <> old.id and remaining_membership.status = 'active'
      )
  ) then
    raise exception 'Assign another active Captain before deleting this account.';
  end if;

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

  -- Remove private inbox/preferences and personal scheduling responses.
  delete from public.community_notifications where recipient_id = old.id;
  delete from public.community_notification_preferences where user_id = old.id;
  delete from public.meeting_invitation_responses where user_id = old.id;

  -- Remove this account's active access. Membership and audit rows remain so
  -- tenant history is preserved and the same account cannot regain access.
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

  -- Revoke invitations addressed to this person and remove the email from
  -- invitation history. Keep invitation/audit rows and their original status.
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

  -- Keep the official resident and household history while removing this
  -- account's name, contact details, birth date, and household relationship.
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

  -- Private user-authored messages are redacted in place. The ticket/feedback
  -- and event rows remain available to staff as operational audit history.
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

  -- This anonymized profile is a tombstone referenced by immutable shared
  -- records. It contains no login email, phone, or public display name.
  update public.profiles
  set display_name = 'Deleted account', deleted_at = coalesce(deleted_at, now()), updated_at = now()
  where id = old.id;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.handle_auth_user_deletion() from public, anon, authenticated;

-- A removal event is complete only after the Auth row itself is gone. This
-- prevents an earlier soft-delete attempt from being mistaken for erasure.
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

  if exists (select 1 from auth.users auth_user where auth_user.id = p_user_id) then
    raise exception 'Auth account still exists; hard deletion is required before removal can be completed';
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
