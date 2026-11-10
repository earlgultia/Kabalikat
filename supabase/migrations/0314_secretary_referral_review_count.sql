-- Secretaries can review referrals too; expose only the pending count on their
-- dashboard, scoped to referrals received by their own active barangay.
create or replace function public.get_secretary_referral_review_count(p_barangay_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pending bigint;
begin
  if not public.is_active_member(p_barangay_id)
    or not public.has_tenant_permission(p_barangay_id, 'referrals.review') then
    raise exception 'not authorized';
  end if;

  select count(*) into v_pending
  from public.interbarangay_referrals referral
  where referral.receiving_barangay_id = p_barangay_id
    and referral.status in ('submitted', 'acknowledged');

  return v_pending;
end;
$$;

revoke all on function public.get_secretary_referral_review_count(uuid) from public, anon;
grant execute on function public.get_secretary_referral_review_count(uuid) to authenticated;
