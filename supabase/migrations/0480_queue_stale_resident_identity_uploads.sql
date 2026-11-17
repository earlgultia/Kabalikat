-- Incomplete ID uploads can leave one sensitive file in Storage indefinitely.
-- Queue both sides and remove the stale submission metadata after 24 hours;
-- the Storage API cleanup remains retryable through the existing queue.
create or replace function public.queue_stale_resident_identity_uploads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized'; end if;

  with stale as materialized (
    select submission.id, submission.front_storage_path, submission.back_storage_path
    from public.resident_identity_submissions submission
    where submission.status = 'uploading'
      and submission.created_at < now() - interval '24 hours'
    order by submission.created_at, submission.id
    for update skip locked
    limit 500
  ), paths as (
    select stale.id as submission_id, file_path.object_path
    from stale
    cross join lateral (values (stale.front_storage_path), (stale.back_storage_path)) file_path(object_path)
  ), queued as (
    insert into public.resident_identity_file_erasure_queue(bucket_id, object_path)
    select 'resident-identity-documents', paths.object_path
    from paths
    on conflict (bucket_id, object_path) do nothing
    returning id
  ), deleted as (
    delete from public.resident_identity_submissions submission
    using stale
    where submission.id = stale.id
    returning submission.id
  )
  select count(*)::integer into v_count
  from deleted
  cross join (select count(*) from queued) ensure_queue_write;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.queue_stale_resident_identity_uploads() from public, anon, authenticated;
grant execute on function public.queue_stale_resident_identity_uploads() to service_role;
