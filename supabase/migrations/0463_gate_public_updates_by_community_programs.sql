-- The public progress and finance feeds live in Community Programs. Enforce
-- that entitlement in the database so direct RPC and table requests cannot
-- bypass the page-level subscription gate.
create or replace function public.enforce_public_update_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tenant_plan_feature_enabled(new.barangay_id, 'community_programs') then
    raise exception 'public barangay updates are unavailable under the current subscription plan';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_public_update_plan() from public, anon, authenticated;

drop trigger if exists barangay_official_public_updates_require_community_programs
  on public.barangay_official_public_updates;
create trigger barangay_official_public_updates_require_community_programs
  before insert or update on public.barangay_official_public_updates
  for each row execute function public.enforce_public_update_plan();

drop trigger if exists barangay_finance_public_updates_require_community_programs
  on public.barangay_finance_public_updates;
create trigger barangay_finance_public_updates_require_community_programs
  before insert or update on public.barangay_finance_public_updates
  for each row execute function public.enforce_public_update_plan();

drop policy if exists barangay_official_public_updates_read_active_members
  on public.barangay_official_public_updates;
create policy barangay_official_public_updates_read_entitled_members
  on public.barangay_official_public_updates for select to authenticated
  using (
    public.is_active_member(barangay_id)
    and public.tenant_plan_feature_enabled(barangay_id, 'community_programs')
  );

drop policy if exists barangay_finance_public_updates_read_active_members
  on public.barangay_finance_public_updates;
create policy barangay_finance_public_updates_read_entitled_members
  on public.barangay_finance_public_updates for select to authenticated
  using (
    public.is_active_member(barangay_id)
    and public.tenant_plan_feature_enabled(barangay_id, 'community_programs')
  );
