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
- A resident can download a JSON copy of their own linked profile, household association, residency-check statuses, profile-correction requests, document-request summaries, incident reports with owner-scoped status history, and private feedback with owner-scoped event history. Queries use the signed-in account, selected barangay, existing RLS policies, or a narrowly scoped owner-only RPC; the export omits internal actor IDs and other residents' records.

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
Migration `0058_resident_owned_feedback_export.sql` provides a private feedback export RPC that remains scoped to the authenticated submitter even when that account also has staff access to the full feedback queue.

Migration `0059_paginated_resident_directory.sql` adds a security-invoker function for searchable, paginated resident directory results with a barangay-wide latest residency status filter. It also adds an index for each resident's newest verification lookup; the function observes the existing resident and household row-level security policies.

Migration `0060_paginated_document_request_queue.sql` adds security-invoker paging and search for document requests, applying the status and text filters before pagination while keeping visibility subject to existing row-level policies. A companion permission-checked RPC returns status history only for the request IDs on the current page.

Migration `0061_paginated_announcement_feed.sql` adds an ordering index for stable announcement paging across published posts and authorized drafts.

Migration `0062_paginated_meeting_schedule.sql` adds a stable tenant/date ordering index for the paginated meeting schedule.

Migration `0063_paginated_invitations.sql` adds a stable tenant/creation-time ordering index for the paginated invitation history.

Migration `0064_paginated_disaster_advisories.sql` adds a stable tenant/creation-time ordering index for disaster advisory paging.

Migration `0065_paginated_barangay_projects.sql` adds a stable tenant/creation-time ordering index for project paging. The client fetches project updates only for projects on the currently visible page; existing row-level security continues to govern both queries.

Migration `0066_paginated_committee_workspaces.sql` adds a stable tenant/name ordering index for committee workspace paging. The client loads members and action items only for committees on the visible page; existing row-level security continues to govern all three queries.

Migration `0067_paginated_health_outreach_schedules.sql` adds a stable tenant/start-time ordering index for outreach schedule paging. The list remains subject to the existing published-schedule and staff-access row-level policies.

Migration `0068_paginated_incident_reports.sql` adds RLS-respecting server-side search and paging for incident reports, with visible-row totals and summary counts derived under the caller's existing policies. Incident history and evidence queries are limited to the incident IDs on the current page; the owner-only status-history RPC also verifies report ownership for every requested ID.

Patrol checkpoint history is loaded only when an authorized user opens a shift's history and is paged in 50-row slices using the existing tenant/shift/time index and row-level policies.

Migration `0069_paginated_patrol_shifts.sql` adds a security-invoker patrol shift page function and an index for stable tenant-scoped ordering. Active shifts appear first, scheduled shifts next, then completed and cancelled shifts; existing row-level policies keep Tanods limited to their assigned records.

Migration `0070_paginated_incident_history.sql` adds an owner-checked RPC for bounded resident incident status history. Incident history is now fetched only when opened and paged in 50-entry slices; resident history continues to omit staff response notes and private evidence events.

`supabase/tests/database/0001_foundation.test.sql` through `0008_finance_budgets.test.sql` cover tenant isolation and key early workflows. `0009_role_targeted_announcement_delivery.test.sql` verifies role-targeted announcement delivery, published-post retargeting, duplicate prevention, notification access for the new audience, access revocation for the former audience, and rejection of platform-scoped targets (including malformed legacy targets). `0010_resident_profile_corrections.test.sql` covers resident ownership, cross-resident and cross-barangay isolation, staff approval, official record updates, withdrawal, audit history, and owner-only decision notifications. `0011_private_community_feedback.test.sql` covers linked-resident eligibility, private submissions, hidden author fields, tenant-scoped staff access, response and closure transitions, event history, and owner-only notifications both with and without a staff response. `0012_public_document_verification.test.sql` checks the two-code verification boundary, minimal public disclosure, expiry, revocation, and revocation audit history. `0013_platform_subscription_controls.test.sql` checks platform-admin-only subscription access and changes, tenant RLS boundaries, validated trial windows, and subscription event history. `0014_resident_owned_feedback_export.test.sql` verifies that personal exports remain owner-scoped even when staff permissions provide access to the broader feedback queue. These pgTAP suites require a local Supabase/Postgres test database; the new GitHub Actions workflow starts an isolated database and runs them, but its first CI result is pending.

This schema does not yet implement complete accounting and reconciliation, patient health records, BHW clinical workflows, youth registry/programs, or OCR processing. QR attendance and meeting PDF export are browser features over the current meeting schema. Review and test migrations against a disposable database before using any real records.
