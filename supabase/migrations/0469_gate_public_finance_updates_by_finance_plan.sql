-- Public finance summaries belong to the Finance entitlement. Residents and
-- officials can read them whenever the barangay's Finance feature is active,
-- independently of Community Programs.
create or replace function public.enforce_public_finance_update_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tenant_plan_feature_enabled(new.barangay_id, 'finance') then
    raise exception 'public finance updates are unavailable under the current subscription plan';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_public_finance_update_plan() from public, anon, authenticated;

drop trigger if exists barangay_finance_public_updates_require_community_programs
  on public.barangay_finance_public_updates;
create trigger barangay_finance_public_updates_require_finance
  before insert or update on public.barangay_finance_public_updates
  for each row execute function public.enforce_public_finance_update_plan();

drop policy if exists barangay_finance_public_updates_read_entitled_members
  on public.barangay_finance_public_updates;
create policy barangay_finance_public_updates_read_finance_members
  on public.barangay_finance_public_updates for select to authenticated
  using (
    public.is_active_member(barangay_id)
    and public.tenant_plan_feature_enabled(barangay_id, 'finance')
  );
