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
27. `supabase/migrations/0027_controlled_interbarangay_referrals.sql` adds policy-confirmed, minimum-information referrals. Destination lookup exposes only active barangay metadata; referral details are returned only to authorized origin and receiving officials through an audited RPC, and there is no cross-tenant resident search.
28. `supabase/migrations/0028_restricted_incident_evidence.sql` adds a private evidence bucket, short-lived incident-bound upload intents, MIME/size metadata validation, and attachment reads restricted to the incident Captain or assigned Tanod. Evidence attachment is added to the append-only incident event trail.
29. `supabase/migrations/0029_health_outreach_campaigns.sql` adds BHW-proposed, Captain-reviewed community outreach schedules and an append-only event log. All active members may read published schedules. It stores event logistics only; no patient records or participant registrations are included.
30. `supabase/migrations/0030_sk_event_scheduling.sql` adds SK Chairperson-proposed, Captain-reviewed event schedules and an append-only event log. Active members can read published schedules; youth registration and attendance tracking are deliberately excluded.
31. `supabase/migrations/0031_incident_escalation_log.sql` adds a Captain-only RPC to record a confirmed external handoff in the append-only incident event history. It does not contact emergency responders; the caller must confirm the handoff already occurred.
32. `supabase/migrations/0032_restore_incident_evidence_event.sql` preserves both `evidence_attached` and `escalated` in the incident event action constraint, repairing databases where migration 0031 replaced the earlier evidence action list.
33. `supabase/migrations/0033_allow_declined_referral_closure.sql` permits an origin barangay to close a declined referral while retaining distinct audit metadata for declined and responded referrals.
34. `supabase/migrations/0034_restrict_official_announcement_audience.sql` separates officials-only announcement access from general announcement reading so resident memberships cannot read officials-only posts.
35. `supabase/migrations/0035_community_update_notifications.sql` creates per-recipient in-app notifications for newly published announcements and disaster advisories, with unread state and RLS checks against current access to the source item. It does not send email or SMS.
36. `supabase/migrations/0036_community_notification_preferences.sql` adds self-managed per-barangay delivery preferences for in-app announcements and advisories; disabled categories are omitted from future notification fan-out.
37. `supabase/migrations/0037_role_targeted_announcements.sql` adds role-specific announcement audiences, restricts resident-only posts to active resident memberships, and generates notices only for the selected eligible audience.
38. `supabase/migrations/0038_interbarangay_referral_activity.sql` adds a permission-checked RPC for viewing referral audit activity by authorized officials from either involved barangay.
39. `supabase/migrations/0039_sk_public_accomplishments.sql` adds Captain-reviewed publication for curated SK project summaries; active barangay members can read published summaries without access to private project records.
40. `supabase/migrations/0040_sk_project_activity.sql` exposes recent SK project audit entries, including staff display names, only to users with SK manage or review permission.
41. `supabase/migrations/0041_restrict_sk_accomplishment_columns.sql` removes direct accomplishment table reads and returns public fields through an RPC that masks internal author and review fields from regular members.
42. `supabase/migrations/0042_audited_document_revocation.sql` allows document-issue staff to revoke a valid issuance with a required reason and records a private, tenant-scoped audit entry.
43. `supabase/migrations/0043_document_request_activity_names.sql` provides request owners and document-read staff with status history that identifies the acting user by display name without exposing account IDs.

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
- Residents can request corrections to their own first name, last name, or phone number. A different staff member with `resident.update` must approve the request before the resident record changes; rejected requests require a reason. Requests and decisions have protected audit events, and direct client writes are revoked.
- A resident can download a JSON copy of their own linked profile, household association, residency-check statuses, profile-correction requests, and document-request summaries. Each query is bound to the signed-in user, selected barangay, and existing RLS policies; the export omits internal actor IDs and other residents' records.

Migration `0044_resident_profile_correction_requests.sql` adds the resident profile correction workflow.
Migration `0045_resident_correction_decision_notifications.sql` adds owner-only in-app notifications when a correction is approved or declined. These transactional notices do not use the optional announcement/advisory notification preferences.
Migration `0046_configurable_document_requirements.sql` adds staff-managed applicant checklists to document types. Changes use permission-checked RPCs and record before/after values in a protected event table.
Migration `0047_public_issued_document_verification.sql` adds a public verification RPC requiring both the request reference and issuance number. It returns only document type, issuing barangay, issue/expiry dates, and validity status.
Migration `0048_resident_correction_request_withdrawal.sql` allows only the original requester to withdraw a still-pending profile correction. The change is recorded in the protected audit history; cancelled requests no longer block a replacement request.
Migration `0049_document_type_activity_history.sql` adds a tenant-scoped RPC for document type managers to inspect creation and edit history with actor display names and before/after values. The private audit table remains unavailable to direct client queries.
Migration `0050_document_request_status_notifications.sql` creates or refreshes a private in-app notification when staff change a linked resident's document request status. The inbox stores only the request pointer; RLS verifies ownership before allowing it to be read or marked as read.
Migration `0051_tighten_notification_resource_access.sql` makes the notification source-access helper enforce active membership and audience-specific read permissions even when called directly. This keeps RPC probing within the same source visibility boundaries as the inbox.
Migration `0052_disaster_emergency_resources.sql` adds draft, publish, and archive workflows for barangay emergency contacts and evacuation centers, with resident read access limited to published entries and protected change history.
Migration `0053_private_community_feedback.sql` lets linked residents submit private feedback and lets Captains and Secretaries move it through review, response, and closure. It withholds submitter identity from the staff queue, records status/response events, and creates owner-only in-app response notices.
Migration `0054_notify_feedback_closure.sql` also creates or refreshes the owner's in-app notice when staff close a feedback item without a response; only the feedback owner can read that notice.
Migration `0055_notify_retargeted_role_announcements.sql` updates the published-announcement notification trigger to run when its target role changes, notifying newly eligible members while keeping existing notification visibility tied to current announcement access.
Migration `0056_align_notification_role_scope.sql` requires role-targeted announcement notifications to match a barangay-scoped membership role, aligning the notification access helper with the announcement read policy.
Migration `0057_scope_role_announcement_delivery.sql` applies that same barangay-role scope check when the announcement trigger creates notifications for a role-targeted post.

`supabase/tests/database/0001_foundation.test.sql` through `0008_finance_budgets.test.sql` are pgTAP integration suites for tenant isolation and key workflows. They require a local Supabase/Postgres test database and have not been executed in this workspace because no Supabase CLI, Docker, or database connection is configured.

This schema does not yet implement complete accounting and reconciliation, patient health records, BHW clinical workflows, youth registry/programs, or OCR processing. QR attendance and meeting PDF export are browser features over the current meeting schema. Review and test migrations against a disposable database before using any real records.
