-- Remove a caller's unregistered receipt object and upload intent after a failed upload.
create or replace function public.discard_financial_receipt_upload_intent(p_receipt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_storage_path text;
begin
  select i.storage_path
    into v_storage_path
  from public.financial_receipt_upload_intents i
  where i.id = p_receipt_id
    and i.created_by = auth.uid()
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.financial_receipts r
    where r.id = p_receipt_id
  ) then
    return false;
  end if;

  delete from storage.objects o
  where o.bucket_id = 'financial-receipts'
    and o.name = v_storage_path;

  delete from public.financial_receipt_upload_intents i
  where i.id = p_receipt_id
    and i.created_by = auth.uid();

  return true;
end;
$$;

revoke all on function public.discard_financial_receipt_upload_intent(uuid) from public, anon;
grant execute on function public.discard_financial_receipt_upload_intent(uuid) to authenticated;
