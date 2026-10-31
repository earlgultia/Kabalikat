-- Support deterministic tenant-scoped paging of emergency directory entries.
create index if not exists disaster_emergency_resources_directory_page_idx
  on public.disaster_emergency_resources(barangay_id, resource_type, name, id);
