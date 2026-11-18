-- Rejected identity scans are no longer needed for review. Preserve the
-- decision metadata, block new reads, and queue both files for Storage deletion.
-- Previously issued signed URLs remain usable only until their 60-second expiry.
create or replace function public.queue_rejected_resident_identity_files()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from 'rejected' and new.status = 'rejected' then
    insert into public.resident_identity_file_erasure_queue(bucket_id, object_path)
    values
      ('resident-identity-documents', new.front_storage_path),
      ('resident-identity-documents', new.back_storage_path)
    on conflict (bucket_id, object_path) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.queue_rejected_resident_identity_files() from public, anon, authenticated;

drop trigger if exists resident_identity_rejection_queues_files on public.resident_identity_submissions;
create trigger resident_identity_rejection_queues_files
  after update of status on public.resident_identity_submissions
  for each row
  when (old.status is distinct from 'rejected' and new.status = 'rejected')
  execute function public.queue_rejected_resident_identity_files();

-- Queue existing rejected scans as well as future rejections.
insert into public.resident_identity_file_erasure_queue(bucket_id, object_path)
select 'resident-identity-documents', path.object_path
from public.resident_identity_submissions submission
cross join lateral (values
  (submission.front_storage_path),
  (submission.back_storage_path)
) path(object_path)
where submission.status = 'rejected'
on conflict (bucket_id, object_path) do nothing;

-- Keep a resident's access to active submissions and verified records, but
-- close access to rejected files while the asynchronous Storage deletion runs.
drop policy if exists resident_identity_private_read on storage.objects;
create policy resident_identity_private_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resident-identity-documents'
    and exists (
      select 1
      from public.resident_identity_submissions submission
      join public.residents resident
        on resident.id = submission.resident_id
       and resident.barangay_id = submission.barangay_id
      where name in (submission.front_storage_path, submission.back_storage_path)
        and (
          (
            submission.uploaded_by = (select auth.uid())
            and resident.user_id = (select auth.uid())
            and resident.record_status = 'active'
            and public.is_active_member(submission.barangay_id)
            and submission.status <> 'rejected'
          )
          or (
            submission.status = 'pending'
            and public.can_review_resident_identity(submission.barangay_id)
          )
        )
    )
  );
