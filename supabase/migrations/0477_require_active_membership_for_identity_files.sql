-- A resident or reviewer must still have active access to the barangay
-- workspace when reading or uploading private identity files.

drop policy if exists resident_identity_upload_insert on storage.objects;
create policy resident_identity_upload_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resident-identity-documents'
    and exists (
      select 1
      from public.resident_identity_submissions submission
      join public.residents resident
        on resident.id = submission.resident_id
       and resident.barangay_id = submission.barangay_id
      where submission.uploaded_by = (select auth.uid())
        and resident.user_id = (select auth.uid())
        and resident.record_status = 'active'
        and public.is_active_member(submission.barangay_id)
        and submission.status = 'uploading'
        and name in (submission.front_storage_path, submission.back_storage_path)
    )
  );

drop policy if exists resident_identity_upload_update on storage.objects;
create policy resident_identity_upload_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'resident-identity-documents'
    and exists (
      select 1
      from public.resident_identity_submissions submission
      join public.residents resident
        on resident.id = submission.resident_id
       and resident.barangay_id = submission.barangay_id
      where submission.uploaded_by = (select auth.uid())
        and resident.user_id = (select auth.uid())
        and resident.record_status = 'active'
        and public.is_active_member(submission.barangay_id)
        and submission.status = 'uploading'
        and name in (submission.front_storage_path, submission.back_storage_path)
    )
  )
  with check (
    bucket_id = 'resident-identity-documents'
    and exists (
      select 1
      from public.resident_identity_submissions submission
      join public.residents resident
        on resident.id = submission.resident_id
       and resident.barangay_id = submission.barangay_id
      where submission.uploaded_by = (select auth.uid())
        and resident.user_id = (select auth.uid())
        and resident.record_status = 'active'
        and public.is_active_member(submission.barangay_id)
        and submission.status = 'uploading'
        and name in (submission.front_storage_path, submission.back_storage_path)
    )
  );

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
          )
          or public.can_review_resident_identity(submission.barangay_id)
        )
    )
  );
