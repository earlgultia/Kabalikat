-- Permission and access changes revoke pending invitations by tenant and
-- issuer. Keep this cleanup bounded as invitation history grows.
create index if not exists invitations_pending_issuer_idx
  on public.invitations (barangay_id, invited_by)
  where status = 'pending';
