-- Support stable, bounded paging of tenant committee workspaces.
create index if not exists committees_tenant_name_page_idx
  on public.committees(barangay_id, name, id);
