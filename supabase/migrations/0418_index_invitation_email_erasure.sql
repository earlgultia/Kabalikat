-- Account erasure anonymizes every invitation addressed to the deleted
-- account, across all barangays and LGUs. Index both lookup paths so cleanup
-- remains bounded as invitation history grows.
create index if not exists invitations_email_erasure_lookup_idx
  on public.invitations (lower(invited_email::text));

create index if not exists lgu_invitations_email_erasure_lookup_idx
  on public.lgu_invitations (lower(invited_email::text));
