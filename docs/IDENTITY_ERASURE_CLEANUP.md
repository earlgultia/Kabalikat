# Resident identity file erasure cleanup

Migration `0465_queue_resident_identity_files_for_erasure.sql` immediately removes a resident's identity submission rows when their Auth account is soft-deleted or hard-deleted. It puts the private object paths in a service-only queue, so no resident or barangay member can read them while the Storage API cleanup is pending. It also detaches the new bucket's Storage owner references before Auth hard deletion. Migration `0480_queue_stale_resident_identity_uploads.sql` queues incomplete uploads older than 24 hours and removes their submission metadata when the worker runs. Migration `0481_cancel_failed_resident_identity_uploads.sql` lets the uploading resident immediately remove a failed in-progress submission from the application and queues both possible files for Storage deletion. Migration `0482_queue_rejected_resident_identity_files.sql` blocks new app reads of rejected scans and queues both files for deletion while preserving the review status and reason. Previously issued signed links can remain usable for up to 60 seconds. Migration `0483_queue_identity_files_before_submission_delete.sql` ensures any future trusted deletion of submission metadata also queues both Storage objects. Migration `0484_notify_resident_of_identity_review.sql` sends the linked active resident a private in-app notice after verification or rejection; the notice contains no ID images or reviewer note. Pending and verified submissions are retained.

The Storage objects must be removed through Supabase Storage, not by deleting rows from `storage.objects`. Apply the full migration chain through 0484 in filename order; migrations 0465 and 0480–0483 provide this queue behavior. Deploy the worker and app changes after the database migrations:

```powershell
supabase functions deploy cleanup-erased-resident-identities
supabase secrets set ERASURE_CLEANUP_SECRET=<generate-a-long-random-secret>
```

Configure a trusted scheduler to send a `POST` request to the deployed function URL on a short interval, with the header `x-erasure-cleanup-secret` set to the same secret. Keep that secret in the scheduler's protected secret store. Each request queues up to 500 stale uploads and processes up to 100 objects; retries are released automatically after a 10-minute claim timeout. The JSON response includes `staleUploadsQueued`, `processed`, and `failed` counts for scheduler monitoring. Failed upload cancellation removes the submission row immediately, but the private Storage objects are physically removed only after the scheduled worker processes the queue.

Until the worker is deployed and scheduled, erased identity scans are inaccessible in the app and queued, but their underlying Storage objects have not yet been physically removed.
