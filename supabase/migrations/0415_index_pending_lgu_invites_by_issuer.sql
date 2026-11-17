-- Super Admin removal revokes pending LGU invitations by issuer. Keep that
-- cleanup efficient as the platform invitation history grows.
create index if not exists lgu_invitations_pending_issuer_idx
  on public.lgu_invitations (invited_by)
  where status = 'pending';
