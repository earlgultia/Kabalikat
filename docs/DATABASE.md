# Database

## Migrations

Apply migrations in order to a disposable development Supabase project:

1. `supabase/migrations/0001_foundation.sql` creates profiles, barangays, memberships, the role and permission catalogs, and platform administrator registry.
2. `supabase/migrations/0002_core_operations.sql` adds invitations, resident and household records, residency verification, document workflows, announcements, meetings, and attendance.
3. `supabase/migrations/0003_phase2_workflow_refinements.sql` repairs duplicate head flags by retaining the first recorded head, enforces one head per household, ensures added members are not marked as heads, and adds an audited resident-owned document resubmission workflow.
4. `supabase/migrations/0004_invitation_revocation.sql` adds authorized revocation for pending invitations and an append-only invitation event log for creation, acceptance, and revocation.
5. `supabase/migrations/0005_private_archive.sql` adds tenant-scoped folders and document metadata, a private Storage bucket, short-lived upload intents, private file policies, searchable text, and archive events.
6. `supabase/migrations/0006_meeting_records.sql` adds reviewed minutes, numbered draft/approved resolutions, meeting record events, and tenant/attendee read policies.
7. `supabase/migrations/0007_qr_attendance.sql` adds hashed short-lived meeting tokens and an authenticated QR check-in RPC that enforces active membership, meeting eligibility, the attendance window, duplicate prevention, and audit records.
8. `supabase/migrations/0008_finance_budgets.sql` adds annual budgets, financial transactions, approval separation, expense caps, and append-only financial events.
9. `supabase/migrations/0009_financial_voids.sql` adds a reasoned, approval-controlled void action for posted transactions while preserving the original amount and recording an append-only event.
10. `supabase/migrations/0010_financial_receipts.sql` adds private, permission-controlled PDF/JPEG/PNG receipt attachments with transaction-bound upload intents and audit events.
11. `supabase/migrations/0011_finance_reports.sql` adds a tenant-scoped audit log for finance CSV report exports.
12. `supabase/migrations/0012_finance_budget_amendments.sql` adds reasoned budget amount change requests with separate approval and a check that reductions stay above posted expenses.
13. `supabase/migrations/0013_workspace_dashboard_metrics.sql` exposes role-gated tenant aggregate counts for the workspace overview without returning underlying records.
14. `supabase/migrations/0014_financial_adjustments.sql` adds linked, independently approved financial adjustments and enforces expense ceilings against the adjusted ledger total.
15. `supabase/migrations/0015_platform_barangay_directory.sql` adds a platform-admin-only directory RPC returning tenant metadata and active membership totals.
16. `supabase/migrations/0016_committee_workspaces.sql` adds assigned-member committee workspaces, status-tracked action items, and append-only committee activity events.
17. `supabase/migrations/0017_sk_project_workspace.sql` adds SK project proposals, independent Captain review, progress/milestone updates, and an append-only event trail separate from the financial ledger.
18. `supabase/migrations/0018_incident_reporting.sql` adds Tanod incident submissions, Captain-only status transitions, tenant-scoped reads, and an append-only incident event trail.
19. `supabase/migrations/0019_incident_assignments.sql` enables Captains to assign active barangay Tanods, grants assignees access to their own reports, and records assignments in the incident event trail.
20. `supabase/migrations/0020_incident_response_updates.sql` lets the assigned Tanod and Captain append response updates to active incidents; the existing event RLS keeps each history tenant- and incident-scoped.
21. `supabase/migrations/0021_tanod_patrol_shifts.sql` adds Captain-scheduled Tanod shifts and append-only manual shift logs, with tenant- and assignee-scoped reads.
22. `supabase/migrations/0022_resident_incident_reports.sql` grants residents permission to submit and read their own incident reports while Captains retain barangay-wide review access.
23. `supabase/migrations/0023_disaster_advisories.sql` adds draft, publish, expiry, and resolution workflows for barangay advisories, with published read access for authorized tenant members.
24. `supabase/migrations/0024_platform_support_portal.sql` adds requester-scoped support tickets, public messages, administrator-only internal notes, and audited status history for platform administrators.
25. `supabase/migrations/0025_subscription_entitlements.sql` adds a plan catalog, default Free subscription for each barangay, admin-managed trial/status updates, and append-only subscription history. No payment provider is configured and subscription state is not used to block tenant operations.
26. `supabase/migrations/0026_barangay_project_tracking.sql` adds tenant-scoped barangay projects, constrained status transitions, progress and milestone updates, event history, and active-member read access; Captains, Secretaries, and Kagawads can manage projects.

Migrations enable RLS and limit authenticated table privileges. Writes that require atomicity or elevated checks run through narrowly scoped `SECURITY DEFINER` RPCs with fixed search paths. Browser code never supplies authority by itself; tenant permissions and ownership are checked in Postgres.

## Phase 2 data and access

- Every operational table is tenant-scoped directly or through a composite tenant foreign key.
- Invitation tokens are generated server-side, stored as SHA-256 hashes, expire after seven days, and can only be accepted by an authenticated account with the matching email.
- Residents can read their own resident and document records. Authorized staff can access tenant queues; household membership alone does not grant access to all household records.
- Document status changes and meeting status/attendance corrections create event records. Announcement inserts and updates create a restricted event log through a trigger.
- Issued-document records are created only after a request reaches the approved state and an authorized issuer performs the transition.
- Platform administrator status does not confer ordinary tenant data access.
- Archive storage is private. Uploads require a short-lived database intent; registered metadata is tied to the exact tenant, file name, MIME type, size, and Storage object path. Signed download links are issued for one minute.
- Archive role access is limited to Captain and Secretary by default. Manually entered searchable text is labeled draft/reviewed; OCR is not configured.
- Meeting minutes and resolutions are readable by authorized meeting readers and invited attendees. Only members with `meeting.manage` can save/review minutes, propose resolutions, or approve them; each transition is logged.
- Meeting reports can be printed or saved as PDF by authorized meeting managers. The report contains only records the page has loaded under the current account's permissions.
- QR codes contain a temporary token in the URL fragment; only its SHA-256 hash is stored. Check-in still requires an authenticated active eligible attendee. The QR token expires within five minutes, can be revoked by refreshing it, and does not replace identity verification by the account.
- Treasurers can submit budgets, transactions, and linked adjustment requests. Captains have a separate approval permission and cannot approve their own submissions. Approved expenses and adjustments are serialized against the budget amount; posted entries cannot be edited or deleted through the client. A different authorized approver can void a posted transaction with a required reason; voided expenses no longer count against budget usage. Receipts, budget amendments, and logged date-range CSV exports are supported.

`supabase/tests/database/0001_foundation.test.sql` through `0008_finance_budgets.test.sql` are pgTAP integration suites for tenant isolation and key workflows. They require a local Supabase/Postgres test database and have not been executed in this workspace because no Supabase CLI, Docker, or database connection is configured.

This schema does not yet implement subscriptions, complete accounting and reconciliation, health records, SK or Tanod workspaces, or OCR processing. QR attendance and meeting PDF export are browser features over the current meeting schema. Review and test migrations against a disposable database before using any real records.
