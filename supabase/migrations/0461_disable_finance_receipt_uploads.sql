-- Keep historical financial receipts available to their existing readers, but
-- disable future attachments. Public finance summaries use a separate text-only feed.
drop policy if exists financial_receipt_storage_upload on storage.objects;
revoke all on function public.create_financial_receipt_upload_intent(uuid, uuid, text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.register_financial_receipt(uuid)
  from public, anon, authenticated;
