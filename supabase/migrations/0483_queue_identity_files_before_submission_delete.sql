-- Never orphan a private ID scan if trusted cleanup removes its metadata.
-- Existing erasure, cancellation, and stale-upload paths already queue files;
-- this trigger makes those operations idempotently safe and covers future ones.
create or replace function public.queue_identity_files_before_submission_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.resident_identity_file_erasure_queue(bucket_id, object_path)
  values
    ('resident-identity-documents', old.front_storage_path),
    ('resident-identity-documents', old.back_storage_path)
  on conflict (bucket_id, object_path) do nothing;

  return old;
end;
$$;

revoke all on function public.queue_identity_files_before_submission_delete() from public, anon, authenticated;

drop trigger if exists resident_identity_submission_delete_queues_files on public.resident_identity_submissions;
create trigger resident_identity_submission_delete_queues_files
  before delete on public.resident_identity_submissions
  for each row execute function public.queue_identity_files_before_submission_delete();
