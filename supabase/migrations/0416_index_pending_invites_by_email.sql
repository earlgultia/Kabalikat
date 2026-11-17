-- Replacement invitations revoke older pending links for the same
-- Barangay and normalized email. Keep that lookup efficient as history grows.
create index if not exists invitations_pending_barangay_email_idx
  on public.invitations (barangay_id, lower(invited_email::text))
  where status = 'pending';
