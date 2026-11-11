-- Storage files must be removed through the Storage API so the backing object
-- is deleted together with its metadata. Database functions only return paths
-- and remove upload-intent rows after the client confirms API cleanup.

create or replace function public.list_expired_financial_receipt_upload_paths()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(i.storage_path order by i.expires_at), '{}'::text[])
  from public.financial_receipt_upload_intents i
  where i.created_by = auth.uid()
    and i.expires_at <= now()
    and public.has_tenant_permission(i.barangay_id, 'finance.manage')
    and not exists (
      select 1 from public.financial_receipts r where r.id = i.id
    );
$$;

revoke all on function public.list_expired_financial_receipt_upload_paths() from public, anon;
grant execute on function public.list_expired_financial_receipt_upload_paths() to authenticated;

-- Permit cleanup only for the current user's unregistered receipt uploads.
drop policy if exists financial_receipt_storage_delete_own_upload on storage.objects;
create policy financial_receipt_storage_delete_own_upload on storage.objects for delete to authenticated
  using (
    bucket_id = 'financial-receipts'
    and exists (
      select 1
      from public.financial_receipt_upload_intents i
      where i.storage_path = name
        and i.created_by = (select auth.uid())
        and public.has_tenant_permission(i.barangay_id, 'finance.manage')
        and not exists (
          select 1 from public.financial_receipts r where r.id = i.id
        )
    )
  );

-- Keep the cleanup RPC compatible with existing clients, but only prune intents
-- whose object is already gone through the Storage API.
create or replace function public.cleanup_expired_financial_receipt_uploads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.financial_receipt_upload_intents i
  where i.created_by = auth.uid()
    and i.expires_at <= now()
    and public.has_tenant_permission(i.barangay_id, 'finance.manage')
    and not exists (
      select 1 from public.financial_receipts r where r.id = i.id
    )
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'financial-receipts'
        and o.name = i.storage_path
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_financial_receipt_uploads() from public, anon;
grant execute on function public.cleanup_expired_financial_receipt_uploads() to authenticated;

-- The browser performs the Storage API deletion before calling this RPC.
create or replace function public.discard_financial_receipt_upload_intent(p_receipt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.financial_receipt_upload_intents i
  where i.id = p_receipt_id
    and i.created_by = auth.uid()
    and not exists (
      select 1 from public.financial_receipts r where r.id = i.id
    )
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'financial-receipts'
        and o.name = i.storage_path
    );

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.discard_financial_receipt_upload_intent(uuid) from public, anon;
grant execute on function public.discard_financial_receipt_upload_intent(uuid) to authenticated;
