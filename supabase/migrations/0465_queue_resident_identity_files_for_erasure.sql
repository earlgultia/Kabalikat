-- Identity scans are especially sensitive. Remove their metadata as soon as an
-- Auth account is erased, then delete the actual objects through the Storage API.
create table public.resident_identity_file_erasure_queue (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text not null check (bucket_id = 'resident-identity-documents'),
  object_path text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  completed_at timestamptz,
  unique (bucket_id, object_path)
);
create index resident_identity_file_erasure_pending_idx
  on public.resident_identity_file_erasure_queue (created_at, id)
  where completed_at is null;
alter table public.resident_identity_file_erasure_queue enable row level security;
revoke all on public.resident_identity_file_erasure_queue from public, anon, authenticated;

create or replace function public.queue_resident_identity_files_for_erasure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.resident_identity_file_erasure_queue(bucket_id, object_path)
  select 'resident-identity-documents', path.storage_path
  from (
    select submission.front_storage_path as storage_path
    from public.resident_identity_submissions submission
    left join public.residents resident
      on resident.id = submission.resident_id
      and resident.barangay_id = submission.barangay_id
    where submission.uploaded_by = old.id or resident.user_id = old.id
    union
    select submission.back_storage_path as storage_path
    from public.resident_identity_submissions submission
    left join public.residents resident
      on resident.id = submission.resident_id
      and resident.barangay_id = submission.barangay_id
    where submission.uploaded_by = old.id or resident.user_id = old.id
  ) path
  where path.storage_path is not null
  on conflict (bucket_id, object_path) do nothing;

  delete from public.resident_identity_submissions submission
  where submission.uploaded_by = old.id
    or exists (
      select 1 from public.residents resident
      where resident.id = submission.resident_id
        and resident.barangay_id = submission.barangay_id
        and resident.user_id = old.id
    );

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;
revoke all on function public.queue_resident_identity_files_for_erasure() from public, anon, authenticated;

drop trigger if exists a_auth_user_identity_files_erasure on auth.users;
create trigger a_auth_user_identity_files_erasure
  before delete on auth.users
  for each row execute function public.queue_resident_identity_files_for_erasure();
drop trigger if exists a_auth_user_identity_files_soft_erasure on auth.users;
create trigger a_auth_user_identity_files_soft_erasure
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.queue_resident_identity_files_for_erasure();

-- Detach object ownership before Auth hard deletion, including the new private
-- identity bucket, so Storage's owner reference cannot block account removal.
create or replace function public.detach_storage_objects_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.to_regclass('storage.objects') is null then return old; end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'objects'
      and column_name = 'owner_id' and is_nullable = 'YES'
  ) then
    execute 'update storage.objects set owner_id = null where owner_id::text = $1 and bucket_id in ($2, $3, $4, $5)'
      using old.id::text, 'barangay-archive', 'financial-receipts', 'incident-evidence', 'resident-identity-documents';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'objects'
      and column_name = 'owner' and is_nullable = 'YES'
  ) then
    execute 'update storage.objects set owner = null where owner::text = $1 and bucket_id in ($2, $3, $4, $5)'
      using old.id::text, 'barangay-archive', 'financial-receipts', 'incident-evidence', 'resident-identity-documents';
  end if;

  return old;
end;
$$;
revoke all on function public.detach_storage_objects_before_auth_deletion() from public, anon, authenticated;

create or replace function public.claim_resident_identity_file_erasure(p_limit integer default 100)
returns table (cleanup_id uuid, bucket_id text, object_path text, claim_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_token uuid := extensions.gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized'; end if;
  return query
  with picked as (
    select queue.id
    from public.resident_identity_file_erasure_queue queue
    where queue.completed_at is null
      and (queue.claimed_at is null or queue.claimed_at < now() - interval '10 minutes')
    order by queue.created_at, queue.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
  ), claimed as (
    update public.resident_identity_file_erasure_queue queue
    set claim_token = v_claim_token,
        claimed_at = now(),
        attempts = queue.attempts + 1,
        last_error = null
    from picked
    where queue.id = picked.id
    returning queue.id, queue.bucket_id, queue.object_path, queue.claim_token
  )
  select claimed.id, claimed.bucket_id, claimed.object_path, claimed.claim_token
  from claimed;
end;
$$;

create or replace function public.finish_resident_identity_file_erasure(
  p_cleanup_ids uuid[],
  p_claim_token uuid,
  p_error text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized'; end if;
  if p_cleanup_ids is null or p_claim_token is null then raise exception 'invalid cleanup claim'; end if;

  if nullif(trim(coalesce(p_error, '')), '') is null then
    delete from public.resident_identity_file_erasure_queue queue
    where queue.id = any(p_cleanup_ids)
      and queue.claim_token = p_claim_token
      and queue.completed_at is null;
  else
    update public.resident_identity_file_erasure_queue queue
    set last_error = left(trim(p_error), 1000),
        claim_token = null,
        claimed_at = null
    where queue.id = any(p_cleanup_ids)
      and queue.claim_token = p_claim_token
      and queue.completed_at is null;
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_resident_identity_file_erasure(integer) from public, anon, authenticated;
revoke all on function public.finish_resident_identity_file_erasure(uuid[], uuid, text) from public, anon, authenticated;
grant execute on function public.claim_resident_identity_file_erasure(integer) to service_role;
grant execute on function public.finish_resident_identity_file_erasure(uuid[], uuid, text) to service_role;
