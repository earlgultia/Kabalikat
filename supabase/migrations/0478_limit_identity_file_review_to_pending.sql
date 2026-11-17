-- Reviewers only need ID file access while a submission is awaiting review.
-- Residents retain access to their own files while their membership is active.
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
          or (
            submission.status = 'pending'
            and public.can_review_resident_identity(submission.barangay_id)
          )
        )
    )
  );
