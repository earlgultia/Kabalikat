-- Support stable, bounded household selection in resident registration.
create index if not exists households_tenant_code_page_idx
  on public.households(barangay_id, household_code, id);
