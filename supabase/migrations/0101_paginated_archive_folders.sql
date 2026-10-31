-- Support stable incremental folder browsing in the private barangay archive.
create index if not exists archive_folders_tenant_name_page_idx
  on public.archive_folders(barangay_id, name, id);
