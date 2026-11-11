-- Clean up interrupted receipt uploads the next time their owner uploads another receipt.
create or replace function public.cleanup_expired_financial_receipt_uploads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.financial_receipt_upload_intents%rowtype;
  v_deleted integer := 0;
begin
  for v_intent in
    select i.*
    from public.financial_receipt_upload_intents i
    where i.created_by = auth.uid()
      and i.expires_at <= now()
    order by i.expires_at
    for update
  loop
    if not exists (
      select 1
      from public.financial_receipts r
      where r.id = v_intent.id
    ) then
      delete from storage.objects o
      where o.bucket_id = 'financial-receipts'
        and o.name = v_intent.storage_path;

      delete from public.financial_receipt_upload_intents i
      where i.id = v_intent.id
        and i.created_by = auth.uid();

      v_deleted := v_deleted + 1;
    end if;
  end loop;

  return v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_financial_receipt_uploads() from public, anon;
grant execute on function public.cleanup_expired_financial_receipt_uploads() to authenticated;
