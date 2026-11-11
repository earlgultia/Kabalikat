-- Keep approved adjustment totals efficient during transaction approval and
-- budget reconciliation, even when a transaction has a long adjustment history.
create index if not exists financial_adjustments_approved_transaction_idx
  on public.financial_adjustments(transaction_id, barangay_id)
  include (amount_change)
  where status = 'approved';

-- Expired upload cleanup scans by expiry and tenant. Cover the fields needed by
-- the managed cleanup query so it can avoid repeatedly reading the base table.
create index if not exists financial_receipt_upload_intents_expiry_idx
  on public.financial_receipt_upload_intents(expires_at, barangay_id)
  include (created_by, storage_path);
