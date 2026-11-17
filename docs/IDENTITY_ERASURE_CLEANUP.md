# Resident identity file erasure cleanup

Migration `0465_queue_resident_identity_files_for_erasure.sql` immediately removes a resident's identity submission rows when their Auth account is soft-deleted or hard-deleted. It puts the private object paths in a service-only queue, so no resident or barangay member can read them while the Storage API cleanup is pending. It also detaches the new bucket's Storage owner references before Auth hard deletion. Migration `0480_queue_stale_resident_identity_uploads.sql` also queues incomplete uploads older than 24 hours and removes their submission metadata when the worker runs; pending and reviewed submissions are retained.

The Storage objects must be removed through Supabase Storage, not by deleting rows from `storage.objects`. Apply migration 0465 for account-erasure cleanup and migration 0480 for abandoned-upload cleanup before deploying the worker:

```powershell
supabase functions deploy cleanup-erased-resident-identities
supabase secrets set ERASURE_CLEANUP_SECRET=<generate-a-long-random-secret>
```

Configure a trusted scheduler to send a `POST` request to the deployed function URL on a short interval, with the header `x-erasure-cleanup-secret` set to the same secret. Keep that secret in the scheduler's protected secret store. Each request queues up to 500 stale uploads and processes up to 100 objects; retries are released automatically after a 10-minute claim timeout. The JSON response includes `staleUploadsQueued`, `processed`, and `failed` counts for scheduler monitoring.

Until the worker is deployed and scheduled, erased identity scans are inaccessible in the app and queued, but their underlying Storage objects have not yet been physically removed.
