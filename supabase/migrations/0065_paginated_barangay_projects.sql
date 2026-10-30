-- Support stable, bounded paging of the tenant project list.
create index if not exists barangay_projects_tenant_created_page_idx
  on public.barangay_projects(barangay_id, created_at desc, id desc);
