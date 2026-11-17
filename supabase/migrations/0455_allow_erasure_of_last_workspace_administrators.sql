-- Direct Auth deletion must be able to erase the last platform, LGU, or
-- barangay administrator. Preserve workspaces and membership history while
-- revoking the deleted account's access and retaining its profile tombstone.
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

-- The erasure handler must read the original email to revoke invitations
-- addressed to it. Alphabetical trigger ordering runs this scrub last.
drop trigger if exists on_auth_user_scrub_identity_on_soft_deletion on auth.users;
drop trigger if exists zz_on_auth_user_scrub_identity_on_soft_deletion on auth.users;
create trigger zz_on_auth_user_scrub_identity_on_soft_deletion
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.scrub_auth_identity_on_soft_deletion();
