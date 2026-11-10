-- Keep uploaded files and their application records when an Auth account is
-- hard-deleted, while removing Storage ownership references that can block the
-- auth.users deletion. KABALIKAT buckets authorize access through their
-- record-scoped policies, not storage.objects owner columns.
create or replace function public.detach_storage_objects_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.to_regclass('storage.objects') is null then
    return old;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'objects'
      and column_name = 'owner_id'
      and is_nullable = 'YES'
  ) then
    execute 'update storage.objects set owner_id = null where owner_id::text = $1 and bucket_id in ($2, $3, $4)'
      using old.id::text, 'barangay-archive', 'financial-receipts', 'incident-evidence';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'objects'
      and column_name = 'owner'
      and is_nullable = 'YES'
  ) then
    execute 'update storage.objects set owner = null where owner::text = $1 and bucket_id in ($2, $3, $4)'
      using old.id::text, 'barangay-archive', 'financial-receipts', 'incident-evidence';
  end if;

  return old;
end;
$$;

revoke all on function public.detach_storage_objects_before_auth_deletion() from public, anon, authenticated;

drop trigger if exists on_auth_user_storage_owner_detach on auth.users;
create trigger on_auth_user_storage_owner_detach
  before delete on auth.users
  for each row execute function public.detach_storage_objects_before_auth_deletion();
