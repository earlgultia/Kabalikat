-- Support stable pagination of tenant-scoped financial report audit records.
create index if not exists finance_report_exports_history_page_idx
  on public.finance_report_exports(barangay_id, created_at desc, id desc);
