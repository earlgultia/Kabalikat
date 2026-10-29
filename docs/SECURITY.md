# Security notes

- Foundation and Phase 2 tables enable RLS; authenticated grants are limited to the operations required by their policies. Public and anonymous access is revoked.
- Tenant access is resolved from active database memberships and role permission mappings, never browser-supplied roles.
- Platform administrator identity remains separate from tenant membership and does not grant resident or operational record access.
- Critical writes use security-definer RPCs with an empty search path, explicit tenant checks, and authenticated execute grants. Invitation tokens are stored only as hashes and acceptance checks the signed-in email.
- Document, meeting, attendance, and announcement changes have database event records. Event tables have read policies and no client write grants.
- The UI hiding a module is not authorization; every feature operation is independently protected by RLS or database permission checks.
- Invitation links are bearer tokens until consumed or expired. Deliver them only through an approved private channel; the app does not send them.
- Account creation is offered only on the invitation route. Creating a Supabase Auth user does not create a tenant membership; the invitation RPC checks the hashed token, expiry, pending status, and authenticated email before it inserts membership.
- Captains can revoke pending invitations. The database rejects expired or already-used links, and invitation creation, acceptance, and revocation are stored in a protected event table.
- Archive files use a private Storage bucket, one-minute signed links, and tenant-scoped read policies. Upload objects require a short-lived, user-bound database intent, and archive metadata is registered only after Storage confirms the object and file metadata.

The included pgTAP tests have not been run in this workspace because no Supabase CLI, Docker, or configured database is available. This work is not a security certification. Apply and test the migrations in a disposable Supabase/Postgres environment before using real records.

Use separate development and production projects. Do not expose a service-role secret in the browser. Define formal retention, disclosure, incident response, backup, and privacy review procedures before production use.
