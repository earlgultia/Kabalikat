-- Keep account-erasure cleanup and resident status lookups bounded as ID
-- submissions accumulate across barangay workspaces.
create index if not exists resident_identity_submissions_uploader_idx
  on public.resident_identity_submissions (uploaded_by, id);

create index if not exists resident_identity_submissions_resident_barangay_idx
  on public.resident_identity_submissions (resident_id, barangay_id, id);
