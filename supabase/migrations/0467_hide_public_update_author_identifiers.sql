-- Public feeds show the office responsible for an update, not the author's
-- internal profile UUID. Keep the tenant column available for RLS filters.
revoke all on public.barangay_official_public_updates from authenticated;
grant select (
  id,
  barangay_id,
  update_type,
  author_role_key,
  title,
  body,
  created_at
) on public.barangay_official_public_updates to authenticated;

revoke all on public.barangay_finance_public_updates from authenticated;
grant select (
  id,
  barangay_id,
  title,
  body,
  created_at
) on public.barangay_finance_public_updates to authenticated;
