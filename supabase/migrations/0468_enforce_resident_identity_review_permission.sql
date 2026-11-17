-- Make the database's private-file checks honor the same explicit permission
-- used by the review UI, including per-membership permission revocations.
create or replace function public.can_review_resident_identity(p_barangay_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_barangay_id is not null
    and public.has_tenant_permission(p_barangay_id, 'resident.identity.review');
$$;

revoke all on function public.can_review_resident_identity(uuid) from public, anon;
grant execute on function public.can_review_resident_identity(uuid) to authenticated;
