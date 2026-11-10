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

Migration `0071_paginated_sk_events.sql` adds a stable tenant/start-time index for SK event paging. The client requests 20 rows at a time with an exact count; existing row-level policies continue to determine which drafts and published events each user can see.

Migration `0072_paginated_sk_event_history.sql` adds an index for event-specific audit history paging. Staff history is loaded only when expanded and in 25-entry pages, avoiding the misleading absence of old history caused by a barangay-wide 200-entry cap. Existing row-level policies remain in force.

Migration `0073_paginated_sk_projects.sql` adds a stable tenant/creation index for SK project proposals. The workspace loads 20 proposals at a time and fetches progress updates and staff-only activity/accomplishment data only for the visible project IDs. The new RPCs enforce the existing SK manager/reviewer permissions and reject requests for more than one page of project IDs.

Migration `0074_paginated_emergency_resource_history.sql` adds per-resource audit history paging for the emergency directory. Staff history is fetched only when expanded, in 25-entry pages, and the page function verifies both disaster-management permission and that the requested resource belongs to the supplied barangay.

Migration `0075_paginated_resident_correction_queue.sql` adds stable indexes for the resident profile-correction history and pending staff queue. Residents see their own request history in 20-entry pages; staff review only the pending queue in 20-entry pages. The pending-request check remains separate so an older resident request cannot hide a still-open request.

Migration `0076_paginated_household_lookup.sql` adds stable tenant/household-code ordering for the resident registration household picker. The picker searches and loads 25 households per page only while the authorized new-resident form is open; the selected household remains visible while browsing other pages.

Migration `0077_paginated_community_notifications.sql` adds a recipient-scoped index for deterministic notification inbox paging. The community updates dialog loads 50 notifications at a time and can fetch older rows on demand; the exact total follows existing row-level security.

Migration `0078_paginated_advisory_history.sql` adds stable per-advisory event ordering for the disaster workspace. Advisory history now loads only when opened and shows 25 entries per page with a total count, while existing tenant-scoped read policies remain in force.

Migration `0079_paginated_emergency_resource_directory.sql` adds stable tenant-scoped ordering for the emergency contact and evacuation center directory. The UI searches and filters server-side, loads 20 entries per page, and prints published entries from the current page; existing row-level security still limits residents to published resources.

Migration `0080_paginated_subscription_history.sql` adds stable ordering for platform subscription audit events. Super Admins can now review all changes in 25-entry pages with an exact total; the platform-administrator row policy remains unchanged.

Migration `0081_paginated_finance_export_history.sql` adds stable ordering for finance report export audit records. Finance readers can inspect previous export date ranges, row counts, and timestamps in 20-entry pages under the existing tenant-scoped policy.

Migration `0082_paginated_financial_transactions.sql` adds stable finance ledger ordering and a 25-entry transaction page. Related adjustments and receipts are fetched only for transactions on the visible page. A permission-checked security-invoker RPC returns complete posted expense totals with approved adjustments, so budget balances remain accurate without loading the full ledger. Date-range CSV exports still read every matching transaction and linked adjustment in bounded batches.

Migration `0083_paginated_community_calendar.sql` adds a tenant-scoped, security-invoker page function that merges published upcoming SK and health events, supports server-side search and event-type filters, and returns an exact total. The calendar UI shows 20 events per page; downloading an ICS file fetches all matching events in bounded pages. Existing event RLS policies continue to control schedule visibility.

Migration `0084_paginated_archive_search.sql` adds stable tenant and folder ordering indexes and a permission-checked archive search page function. The archive UI shows 25 matching private files per page and can reach older results beyond the previous 200-file cap; signed file links retain their one-minute expiry.

Migration `0085_paginated_meeting_resolutions.sql` adds stable meeting-specific ordering for resolutions. Meeting details show resolutions in 25-entry pages, while PDF export fetches every resolution in bounded pages before printing the complete report. Existing meeting and attendee row-level policies remain in force.

Migration `0086_paginated_meeting_member_picker.sql` adds a membership-permission-checked search page for active meeting invitees. The meeting form loads 25 matching members at a time and keeps checked invitees selected while browsing pages.

Migration `0087_paginated_platform_barangay_directory.sql` adds platform-admin-only, server-side paging and search for the barangay directory, plus aggregate platform counts. The directory UI loads 25 rows per page and exports all rows matching the current search and status filter in bounded pages.

Migration `0088_paginated_platform_subscriptions.sql` adds platform-admin-only paging and server-side status/search filters for the subscription workspace, along with compact platform-wide review counts. The Super Admin overview and subscriptions workspace use these bounded RPCs; filtered CSV export collects all matches in pages.

Migration `0089_paginated_platform_support_queue.sql` adds an explicitly platform-admin-checked queue page that returns each support ticket with its barangay label. The Super Admin support UI no longer downloads the full barangay directory to label a paginated ticket list. Tenant-facing ticket reads and existing conversation/history RLS are unchanged.

Migration `0090_paginated_support_threads.sql` adds stable descending indexes for support conversation messages and status events. The support UI loads the most recent 25 entries when a thread is opened and allows older messages and status changes to be loaded in additional pages; existing row-level security still controls which entries each user can read.

Migration `0091_paginated_committee_member_picker.sql` adds a `committee.manage`-checked search page for active tenant members not yet assigned to a selected committee. The assignment picker loads 25 matching members only when opened and supports search and paging; membership changes still go through the existing audited assignment RPC.

Migration `0092_paginated_interbarangay_referrals.sql` adds permission-checked referral pages and per-referral activity pages. Viewing events are recorded only for the referrals returned on the current page. The UI shows 25 referrals at a time and loads activity history only when opened; the old unbounded listing RPCs are no longer executable by authenticated users.

Migration `0093_paginated_referral_destinations.sql` adds a `referrals.create`-checked page for active receiving barangays and disables the former full destination list for authenticated users. Referral creation now searches and selects from 25 destinations at a time.

Migration `0094_paginated_tanod_assignment_picker.sql` replaces the unbounded incident and patrol Tanod directory RPCs with a searchable 25-row page. The picker checks the specific management permission, returns only active Tanods in the selected barangay, and preserves a currently assigned Tanod in the options.

Migration `0095_meeting_scoped_attendee_directory.sql` replaces the meeting UI's full barangay member directory read with the roster for the selected meeting only. The RPC requires `meeting.manage` and returns only attendee IDs, display names, and current role labels for that meeting.

Migration `0096_paginated_document_type_activity.sql` replaces the unbounded document configuration audit RPC with a permission-checked 25-entry page and a stable tenant history index. The document setup UI loads the history only when opened and provides older-page navigation.

Migration `0097_paginated_sk_accomplishments.sql` adds separate permission-aware pages for published summaries and the internal review queue, plus a lightweight publication-year list. Public members can read published summaries only; staff-only fields and review rows remain restricted. CSV export fetches every matching published row in bounded pages.

Migration `0098_paginated_project_progress_history.sql` adds stable, permission-preserving page functions for barangay and SK project updates and SK project audit activity. Project cards now fetch progress only when its history is opened; activity records are separately permission-checked and paged.

Migration `0099_paginated_finance_budgets.sql` adds 20-budget and 25-amendment pages, a pending-amendment indicator per budget, and page-scoped expense totals. Finance cards and budget selection now browse pages without downloading the full budget or amendment tables.

Migration `0100_paginated_feedback_history.sql` adds a stable index for private feedback activity history. The feedback page now fetches one item's history only when opened and pages that history in groups of 25 under the existing row-level policies.

Migration `0101_paginated_archive_folders.sql` adds stable folder-name ordering for archive pagination. The folder filter and upload picker load 50 options at a time and can fetch more without dropping already loaded choices.

Migration `0102_complete_resident_data_export.sql` adds an owner-scoped paginated feedback export RPC. The resident data download now reads large owned record sets in batches and retrieves incident histories and feedback with bounded page requests, preserving complete exports without a single oversized response.

Migration `0103_searchable_health_outreach_queue.sql` adds a stable, searchable status-filtered page for health outreach schedules. The outreach screen searches title, location, and details and filters by workflow status; the invoker-security RPC continues to apply existing row-level policies.

Migration `0104_searchable_sk_event_queue.sql` adds a stable, searchable status-filtered page for SK event schedules. The SK event screen searches title, location, and details and filters by workflow status; the invoker-security RPC continues to apply existing row-level policies.

Migration `0105_searchable_patrol_shift_queue.sql` adds a stable, searchable status-filtered page for patrol shifts. The patrol screen searches shift titles and areas, preserves active/scheduled/completed ordering, and applies existing visibility policies through an invoker-security RPC.

Migration `0106_searchable_meeting_schedule.sql` adds server-side text and status filters to the paginated meeting schedule. Search covers the title, location, and agenda; the invoker-security function preserves the existing tenant and attendee row-level policies.

Migration `0107_paginated_meeting_status_history.sql` adds a stable tenant/meeting index for status events. Authorized meeting managers can inspect status changes and recorded reasons in an on-demand 25-entry history; the existing RLS policy continues to control access.

Migration `0108_meeting_schedule_change_notifications.sql` records changes to meeting title, location, time, and agenda, then sends in-app notifications only to active invited attendees other than the editor. Schedule-change alerts can be disabled in account notification preferences. Event details remain attendee-scoped, and opening an alert takes the user to that meeting's paginated card.

Migration `0109_meeting_status_change_notifications.sql` sends attendee-only in-app notices when a meeting is completed or cancelled, using the existing meeting-update preference and event privacy rules. The notification detail includes the status and recorded reason, and opening it routes to the meeting card.

Migration `0110_meeting_notification_snapshots.sql` stores the title, location, and start/end times associated with each new meeting notification. Invitees see the time or location that prompted a schedule alert even if the meeting is edited again later. Existing event rows cannot recover historical values and continue to fall back to the current meeting details. Snapshot fields are only exposed through the attendee-scoped details RPC.

Migration `0111_aggregate_health_outreach_attendance.sql` lets an authorized BHW record a bounded aggregate attendance count when completing an outreach schedule. The count is visible with completed schedules; no participant list, patient record, or identifying information is collected. Completion remains permission-checked and writes the aggregate count into the existing audit history.

Migration `0112_health_outreach_aggregate_summary.sql` adds an RLS-respecting summary RPC for matching schedule count, completed count, and aggregate attendance. The health outreach page displays these three figures for the current search and status filters without downloading extra campaign rows.

Migration `0113_health_outreach_revision_workflow.sql` gives returned schedules a distinct `changes_requested` status. The creator can revise a draft or returned schedule and resubmit it for Captain review; review and edits are recorded in the existing staff-only event history. Legacy rejected rows represented as cancelled are migrated to the new status.

Migration `0114_health_outreach_cancellation.sql` lets authorized staff cancel a published, upcoming or in-progress outreach schedule with a required reason. The cancellation is audited, and active barangay members can still view the cancelled schedule and its reason. The health outreach page exposes the cancellation action and reason using the paginated schedule workflow.

Migration `0115_paginated_health_outreach_history.sql` adds a staff-authorized page RPC and index for outreach audit events. Outreach cards now lazily display actor, action, timestamp, and event note in responsive 25-entry pages. Event notes and actor names remain behind the explicit management/review permission check.

Migration `0116_health_outreach_cancellation_notifications.sql` delivers in-app cancellation alerts to active members, except the staff member who cancelled the schedule, and respects the per-barangay health outreach notification preference. Notification access is limited to the active member and the matching cancelled schedule. Opening an alert shows the cancellation reason and navigates to the cancelled schedule page.

Migration `0117_health_outreach_completion_notifications.sql` also delivers in-app notices when an outreach is completed. Notices include only the aggregate attendance total, honor the same notification preference, exclude the completing staff member, and link to the completed schedule. The notification detail RPC reveals only completed or cancelled schedules in the active member's barangay.

Migration `0118_health_outreach_review_notifications.sql` privately alerts the creator when a Captain requests schedule changes. The event and note are returned only to the schedule's creator with the required management permission; opening the alert navigates to the current schedule page. A creator can no longer review their own schedule.

Migration `0119_health_outreach_publication_notifications.sql` alerts active barangay members when a Captain publishes an outreach schedule. Delivery honors each member's health outreach notification preference, excludes the publishing reviewer, and links to the published schedule. Publication notices remain readable after the schedule is completed or cancelled so an older alert does not become invalid when its status changes.

Migration `0120_health_outreach_review_queue_summary.sql` extends the health outreach summary RPC with counts for schedules awaiting review and schedules returned for changes. The responsive dashboard surfaces those queue totals alongside the active-filter totals, completions, and aggregate attendance. Counts use the caller's RLS-visible campaign rows and current search term.

Migration `0121_health_outreach_review_submission_alerts.sql` creates reviewer-only in-app alerts when new outreach schedules are submitted or a returned schedule is resubmitted. Alerts go only to active memberships with effective `health.campaign.review` permission; resubmission refreshes the existing alert as unread. Opening it navigates to the matching draft page, and RLS hides the alert after the schedule leaves the review queue.

Migration `0122_sk_event_review_submission_alerts.sql` alerts active users with effective `sk.event.review` permission when an SK event is submitted. The alert deep-links to the matching draft event, is hidden when review is complete, and does not expose draft schedules or event details to residents.

Migration `0123_sk_event_publication_notifications.sql` delivers in-app alerts when an SK event is published, honoring the new per-barangay `sk_event_update` preference. Active members can open the alert to the published event; access remains available after completion and excludes unpublished or rejected schedules.

Migration `0124_sk_event_queue_summary.sql` adds a search-aware, RLS-respecting SK event overview with totals for schedules awaiting review, published, completed, and returned or cancelled. The responsive UI lets staff select a status card to open that portion of the schedule queue.

`supabase/tests/database/0001_foundation.test.sql` through `0008_finance_budgets.test.sql` cover tenant isolation and key early workflows. `0009_role_targeted_announcement_delivery.test.sql` verifies role-targeted announcement delivery, published-post retargeting, duplicate prevention, notification access for the new audience, access revocation for the former audience, and rejection of platform-scoped targets (including malformed legacy targets). `0010_resident_profile_corrections.test.sql` covers resident ownership, cross-resident and cross-barangay isolation, staff approval, official record updates, withdrawal, audit history, and owner-only decision notifications. `0011_private_community_feedback.test.sql` covers linked-resident eligibility, private submissions, hidden author fields, tenant-scoped staff access, response and closure transitions, event history, and owner-only notifications both with and without a staff response. `0012_public_document_verification.test.sql` checks the two-code verification boundary, minimal public disclosure, expiry, revocation, and revocation audit history. `0013_platform_subscription_controls.test.sql` checks platform-admin-only subscription access and changes, tenant RLS boundaries, validated trial windows, and subscription event history. `0014_resident_owned_feedback_export.test.sql` verifies that personal exports remain owner-scoped even when staff permissions provide access to the broader feedback queue. These pgTAP suites require a local Supabase/Postgres test database; the new GitHub Actions workflow starts an isolated database and runs them, but its first CI result is pending.

This schema does not yet implement complete accounting and reconciliation, patient health records, BHW clinical workflows, youth registry/programs, or OCR processing. QR attendance and meeting PDF export are browser features over the current meeting schema. Review and test migrations against a disposable database before using any real records.


Migration `0125_sk_event_revision_workflow.sql` distinguishes returned SK event proposals from cancellations. Creators can edit their own draft or returned schedule and resubmit it; the review queue and private creator feedback notification are refreshed on each cycle. The responsive event page exposes the changes-requested queue, edit form, and Captain feedback. Historical rejection audit entries are used to migrate previously returned proposals from `cancelled` to `changes_requested`.


Migration `0126_sk_event_cancellation_notifications.sql` lets authorized SK event managers cancel a published event that has not ended, requires an explanation, records the cancellation in the event activity history, and alerts opted-in active barangay members. Residents and other active members can view the cancelled public schedule and its reason; notification details are tenant scoped.


Migration `0127_sk_event_rescheduling.sql` lets authorized SK managers reschedule published events with a required reason. It records the old and new times and location, adds an audited event-history entry, and sends preference-aware updates to active barangay members. The reason is public and should not contain names or private details. Schedule snapshots are visible only to active members while the event remains public, and notification links retain access if the event is later completed or cancelled.


Migration `0128_paginated_sk_event_schedule_history.sql` adds a bounded, tenant-scoped schedule history RPC for public SK events. Active members can page through the old and new location and date values with the recorded reason; unpublished schedules and cross-barangay history remain inaccessible. The event card loads this history only when opened.


Migration `0129_sk_event_notification_summary.sql` adds a tenant-scoped, manager-only aggregate RPC for SK publication, schedule update, and cancellation notification counts and read counts. The responsive event card fetches it on demand and reveals no member identities. Notification delivery and read status do not indicate RSVP or attendance. Apply after `0128_paginated_sk_event_schedule_history.sql`.


Migration `0130_sk_event_future_schedule_guard.sql` adds a database trigger to require a future start for new or returned SK proposals and to prevent publishing an event that has already started. The create/edit UI validates the same rule before submission. Apply after `0129_sk_event_notification_summary.sql`.


Migration `0131_health_outreach_future_schedule_guard.sql` adds a trigger requiring future start times for new or returned health outreach schedules and blocks publication after a proposal's start time. The proposal form, edit form, and reviewer controls validate the same rule. It changes schedule logistics only and adds no patient or participant data. Apply after `0130_sk_event_future_schedule_guard.sql`.

Migration `0132_health_outreach_rescheduling.sql` lets authorized outreach managers and reviewers reschedule a published upcoming or in-progress outreach. It snapshots the old and new location/time with a public reason, adds the change to staff activity history, shows the public change history to active members, and sends preference-aware community notifications. The workflow stores only schedule logistics and does not add participant or patient records. Apply after `0131_health_outreach_future_schedule_guard.sql`.

Migration `0133_health_outreach_notification_summary.sql` adds a permission-checked aggregate of outreach publication, schedule update, cancellation, and completion notifications sent and marked read. Managers can open the counts from an outreach card; individual recipients are never shown. The counts describe in-app notices only, not attendance. Apply after `0132_health_outreach_rescheduling.sql`.

Migration `0134_health_outreach_early_completion.sql` lets managers complete an outreach after it has started but before its scheduled end, with a required reason and aggregate attendance count. It records an explicit early-completion activity entry and sends the existing preference-aware completion notice. An event cannot be completed early before its start time. Apply after `0133_health_outreach_notification_summary.sql`.

Migration `0135_health_outreach_attendance_correction.sql` adds a manager-only correction RPC for completed outreach totals. Every correction requires a reason and creates a staff activity entry with the old and new aggregate values; it never creates participant records. Apply after `0134_health_outreach_early_completion.sql`.

Migration `0136_health_outreach_start_date_filters.sql` adds server-side date-window filtering for the BHW outreach queue, summary cards, and complete CSV export, using the existing tenant/start schedule index. Start and end dates are interpreted in the user's local timezone; the end date is inclusive. Existing row-level security remains in force. Apply after `0135_health_outreach_attendance_correction.sql`.

Migration 0137_sk_event_early_completion.sql allows managers to complete a started SK event before its scheduled end with a required 3-to-1000 character reason. The staff activity log records early completion, opted-in active members receive an in-app notice, and the update panel links to the event. The manager-only notification reach summary includes completion notice sent/read totals. Completion before the event starts is rejected. Apply after 0136_health_outreach_start_date_filters.sql; hosted database behavior has not been verified.

Migration `0138_sk_event_start_date_filters.sql` adds local-date start-window filters to the paginated SK event queue and its status summary. The responsive UI applies the same range to CSV exports. The new SECURITY INVOKER functions preserve caller RLS; an end date is implemented as the exclusive start of the following local day. Apply after `0137_sk_event_early_completion.sql`; hosted database behavior has not been verified.

Migration `0139_meeting_schedule_start_date_filters.sql` adds an RLS-preserving paginated meeting schedule function with local-date start-window filtering. The meeting page uses the same range for the list and manager-only schedule CSV export, with only title, location, dates and status included. Apply after `0138_sk_event_start_date_filters.sql`; hosted database behavior has not been verified.

Migration `0140_community_calendar_start_date_filters.sql` adds local-date start-window filtering to the combined published SK and health outreach calendar. The page and full ICS download share the same filter, with existing tenant RLS and published/upcoming visibility preserved. Apply after `0139_meeting_schedule_start_date_filters.sql`; hosted database behavior has not been verified.

Migration `0141_announcement_search_and_date_filters.sql` adds an RLS-preserving server-side announcement page with title/body search, status selection, and a local-date creation window. Existing announcement and role-target visibility policies still control which rows are returned. Apply after `0140_community_calendar_start_date_filters.sql`; hosted database behavior has not been verified.

Migration `0142_incident_report_date_filters.sql` adds local creation-date bounds to the paginated incident report queue while retaining SECURITY INVOKER, tenant scoping, existing RLS, search, status, and category filters. The incident page converts local inclusive dates to an inclusive start and exclusive next-day end. Incident evidence remains outside the filter/export surface and behind its existing access controls. Apply after `0141_announcement_search_and_date_filters.sql`; hosted database behavior has not been verified.

Migration `0143_incident_manager_queue_breakdown.sql` adds a SECURITY INVOKER aggregate-only incident queue summary for users with `incident.manage`. It reports status and category totals within the selected report-date range, includes zero-count categories/statuses, and returns no incident details. Apply after `0142_incident_report_date_filters.sql`; hosted database behavior has not been verified.

Migration `0144_incident_assignment_notifications.sql` sends an in-app alert when an incident is assigned or reassigned to a Tanod. The alert contains no report details and is readable/markable only by the currently assigned active member with incident reporting permission; reassignment hides it from the previous assignee and reopens it for a returning assignee. Apply after `0143_incident_manager_queue_breakdown.sql`; hosted database behavior has not been verified.

Migration `0145_incident_status_notifications.sql` sends a generic in-app status update to the incident report creator when another user changes its status. The notification includes no report details and can be read or marked read only by that report's creator while they retain active membership and incident reporting permission. Apply after `0144_incident_assignment_notifications.sql`; hosted database behavior has not been verified.

Migration `0146_incident_severity_filter.sql` adds a validated server-side severity filter to the incident report queue, alongside existing tenant RLS, search, status, category and local creation-date filters. Apply after `0145_incident_status_notifications.sql`; hosted database behavior has not been verified.

Migration `0147_incident_assigned_to_me_filter.sql` adds an assignee-only view to the paginated incident queue. The RPC matches `assigned_to` to the authenticated user and preserves SECURITY INVOKER and existing RLS visibility. Apply after `0146_incident_severity_filter.sql`; hosted database behavior has not been verified.

Migration `0148_incident_assignment_queue_filter.sql` adds manager triage for unassigned incidents and unifies the assignment selector into all, assigned to me, and unassigned modes. The paginated SECURITY INVOKER query preserves tenant scoping, existing RLS, and all incident search/date/status/category/severity filters. Apply after `0147_incident_assigned_to_me_filter.sql`; hosted database behavior has not been verified.

Migration `0149_incident_unassigned_queue_summary.sql` extends the permission-checked incident aggregate with a date-aware count of active reports without an assignee. The manager queue overview displays only this count and status/category aggregates, with no report details. Apply after `0148_incident_assignment_queue_filter.sql`; hosted database behavior has not been verified.

Incident queue CSV export reuses the permission-checked paginated queue RPC and applies the current search, status, category, severity, assignment and date filters across all pages. It exports a small operational field set; details and evidence are not included. No database migration is required.

Migration `0150_incident_needs_attention_filter.sql` adds an active-status switch to the manager incident queue query. It composes with status, assignment, search, category, severity and date filters and preserves tenant RLS and pagination. Apply after `0149_incident_unassigned_queue_summary.sql`; hosted database behavior has not been verified.

Migration `0151_patrol_shift_assignment_notifications.sql` sends an in-app notification when a patrol shift is assigned or reassigned. Notification access follows the current assigned Tanod, active membership and patrol permission; prior assignees lose access after reassignment. The notice contains no shift notes. Apply after `0150_incident_needs_attention_filter.sql`; hosted database behavior has not been verified.

Migration `0152_patrol_cancellation_notifications.sql` notifies the current assigned Tanod when a Captain cancels a scheduled shift. The notice is a resource pointer only, visible only to the active assignee with `patrol.access`, and deep-links to the shift. Apply after `0151_patrol_shift_assignment_notifications.sql`; hosted database behavior has not been verified.

Migration `0153_patrol_shift_rescheduling.sql` adds a Captain-only RPC to reschedule future scheduled patrols, records previous and new schedule details plus the reason in the restricted append-only shift log, and notifies the current assignee. The responsive patrol workspace exposes the edit form on scheduled shifts; the notification contains only the shift pointer. Apply after `0152_patrol_cancellation_notifications.sql`; hosted database behavior has not been verified.

Migration `0154_patrol_lifecycle_notifications.sql` notifies active users with `patrol.manage` when an assigned Tanod starts or completes a shift. Alerts contain a shift pointer, remain readable only while the recipient has an active membership and patrol management permission, and open the paginated patrol queue at that shift. Apply after `0153_patrol_shift_rescheduling.sql`; hosted database behavior has not been verified.

Migration `0155_patrol_completion_handover.sql` replaces the no-summary completion RPC with an assigned-Tanod-only operation that requires a 10-1,500 character handover. Completion and its summary are committed together to the restricted shift log, and the responsive active-shift UI collects the report before closing the patrol. Apply after `0154_patrol_lifecycle_notifications.sql`; hosted database behavior has not been verified.

Migration `0156_filtered_patrol_shift_history.sql` adds a security-invoker, bounded page function for filtering one patrol shift's history by log type and date range. Existing shift-log RLS remains in force; the desktop and mobile history controls page and filter on the server. Apply after `0155_patrol_completion_handover.sql`; hosted database behavior has not been verified.

Migration `0157_patrol_coverage_summary.sql` adds a Captain-permission-checked aggregate for patrol shift status and field log totals over a date range. It returns counts only, and the patrol dashboard provides a responsive date range selector and summary cards. Apply after `0156_filtered_patrol_shift_history.sql`; hosted database behavior has not been verified.

Migration `0158_platform_activity_log.sql` records barangay onboarding and subscription create/update events using fixed, non-sensitive summaries. A platform-admin-only, searchable paginated RPC backs the Super Admin activity page; the UI can export all matching high-level events in bounded pages with formula-safe CSV encoding. Private tenant records are not copied into the log. Apply after `0157_patrol_coverage_summary.sql`; hosted database behavior has not been verified.

Migration `0159_platform_subscription_plan_editor.sql` adds a platform-administrator-only RPC for updating plan name, description, boolean entitlement metadata, and active status. Direct table writes remain revoked. Each update records only the plan key in the platform activity log, and the Free plan is required to remain active. The Super Admin plan catalog provides a responsive editor; entitlements are still metadata and do not enforce workspace access. Apply after `0158_platform_activity_log.sql`; hosted database behavior has not been verified.

Migration `0160_preserve_existing_inactive_plan_assignments.sql` permits an inactive plan only when the tenant already has that plan assigned. The subscription editor continues to show that current choice, supports updating status and dates without silently replacing it, and still prevents assigning the inactive plan to other barangays. Apply after `0159_platform_subscription_plan_editor.sql`; hosted database behavior has not been verified.

Migration `0161_platform_subscription_review_queue_summary.sql` aligns the platform-wide `needs_review_count` with the queue filter by including suspended subscriptions as well as elapsed trials and past-due grace periods. The Super Admin dashboard exposes this count as a responsive shortcut that opens the review queue; it never changes subscription state automatically. Apply after `0160_preserve_existing_inactive_plan_assignments.sql`; hosted database behavior has not been verified.

Migration `0162_platform_upcoming_trial_review.sql` adds a platform-admin-only count and queue filter for trial subscriptions ending within seven days. The Super Admin dashboard provides a desktop/mobile shortcut and marks matching rows for review; it does not change a trial or tenant's access. Apply after `0161_platform_subscription_review_queue_summary.sql`; hosted database behavior has not been verified.

Migration `0163_platform_subscription_plan_usage_counts.sql` adds a platform-admin-only assigned-barangay total to each subscription plan result. The plan catalog displays the aggregate beside each plan so administrators can see current usage before changing availability. Apply after `0162_platform_upcoming_trial_review.sql`; hosted database behavior has not been verified.

Migration `0164_detailed_subscription_plan_activity.sql` records the names of changed plan metadata fields in the platform activity summary without copying their values. No-op saves do not create activity entries. The activity page displays changed fields as compact labels on desktop and mobile. Apply after `0163_platform_subscription_plan_usage_counts.sql`; hosted database behavior has not been verified.

Migration `0165_explicit_subscription_deadline_reset.sql` preserves existing trial/grace deadlines and start date when the plan and status are unchanged. A platform administrator must explicitly select “Reset the relevant dates from today” to restart them; changing a plan or status calculates new dates from the entered durations. Existing six-argument RPC calls remain supported and use the preserve-by-default behavior. The responsive editor explains this choice. Apply after `0164_detailed_subscription_plan_activity.sql`; hosted database behavior has not been verified.

Migration `0166_upcoming_subscription_grace_review.sql` adds an admin-only count and filter for past-due grace periods ending in the next seven days. The Super Admin dashboard shortcut opens the matching review queue and marks affected rows on desktop and mobile; it does not change subscription status or tenant access. Apply after `0165_explicit_subscription_deadline_reset.sql`; hosted database behavior has not been verified.

Migration `0167_subscription_deadline_audit_details.sql` records before-and-after start, trial-end, and grace-end timestamps with each admin-managed subscription change. The subscription history UI displays those date snapshots responsively; older events are labeled as predating the detail capture. Apply after `0166_upcoming_subscription_grace_review.sql`; hosted database behavior has not been verified.

Migration `0168_platform_activity_date_filters.sql` adds inclusive local-day date filtering to the platform-admin activity page RPC. The searchable activity list and filtered CSV export use the same date window. Apply after `0167_subscription_deadline_audit_details.sql`; hosted database behavior has not been verified.

Migration `0169_platform_activity_actor_search.sql` adds the recorded administrator display name to platform activity search while preserving its date and action filters. The existing search field and matching CSV export can find events by barangay, actor, or summary. Apply after `0168_platform_activity_date_filters.sql`; hosted database behavior has not been verified.

Migration `0170_snapshot_platform_activity_actor_name.sql` stores the administrator display name on each platform activity event when it is created, backfills existing events, and uses that snapshot for search and export. Historical audit entries therefore remain stable if an administrator later changes their profile name. Apply after `0169_platform_activity_actor_search.sql`; hosted database behavior has not been verified.

Migration `0171_protect_platform_activity_actor_name.sql` rejects updates that would change the actor-name snapshot on an existing platform activity event. Apply after `0170_snapshot_platform_activity_actor_name.sql`; hosted database behavior has not been verified.

Migration `0172_make_platform_activity_append_only.sql` rejects updates and deletes to platform activity events, preserving the history as an append-only audit trail. Apply after `0171_protect_platform_activity_actor_name.sql`; hosted database behavior has not been verified.

Migration `0173_block_platform_activity_truncate.sql` also rejects `TRUNCATE`, which does not invoke row-level update/delete triggers. This protects platform activity history from an accidental table-wide clear by a role that has truncate permission. Apply after `0172_make_platform_activity_append_only.sql`; hosted database behavior has not been verified.

Migration `0174_snapshot_platform_activity_export.sql` adds a platform-admin-only keyset export RPC that fixes an upper-bound event snapshot and pages by `(created_at, id)`. The platform activity CSV uses this endpoint so new events arriving during a long export do not shift offset pages and cause duplicates or omissions. Apply after `0173_block_platform_activity_truncate.sql`; hosted database behavior has not been verified.

Migration `0175_requester_reopen_resolved_support.sql` lets the original requester reopen their own resolved support ticket with a required explanation. The transaction records that explanation as a public conversation message and adds the status transition to the ticket history; closed tickets stay terminal. The support UI exposes the action on desktop and mobile. Apply after `0174_snapshot_platform_activity_export.sql`; hosted database behavior has not been verified.

Migration `0176_platform_support_queue_summary.sql` adds an aggregate-only RPC for platform administrators to see support request totals by status. The Super Admin support page uses the counts as responsive status filters; the RPC returns no ticket content. Apply after `0175_requester_reopen_resolved_support.sql`; hosted database behavior has not been verified.

Migration `0177_platform_support_stale_ticket_filter.sql` adds a platform-admin-only paginated view and aggregate count for new or in-progress support requests with no recorded activity for at least three days. The responsive Super Admin queue provides a matching attention filter; requester-waiting, resolved, and closed tickets are excluded. Apply after `0176_platform_support_queue_summary.sql`; hosted database behavior has not been verified.

Migration `0178_support_ticket_requester_notifications.sql` adds in-app notices for requesters when the support team posts a public reply or changes ticket status. Notification access is limited to the ticket's requester and active barangay membership; internal notes do not generate notices. The community-updates panel links the notice to Help & Support. Apply after `0177_platform_support_stale_ticket_filter.sql`; hosted database behavior has not been verified.

Migration `0179_captain_membership_access_management.sql` lets Captains change non-Captain barangay roles and suspend or reactivate memberships through a tenant-scoped RPC. Self-access changes and Captain role changes are rejected. Each change is recorded in a read-restricted access history, shown alongside the responsive Staff & access page. Apply after `0178_support_ticket_requester_notifications.sql`; hosted database behavior has not been verified.

Migration `0180_captain_barangay_office_settings.sql` adds Captain-managed office address, public contact details, office hours, and printed document signatory name/title. A permission-checked RPC validates and saves settings atomically and records changed field names in tenant-scoped history. It does not store a drawn signature. The Barangay settings page supports these fields on mobile and desktop. Apply after `0179_captain_membership_access_management.sql`; hosted database behavior has not been verified.

Migration `0181_captain_review_queue_summary.sql` adds an aggregate-only Captain review summary for latest pending residency checks, resident profile corrections, document requests, finance approvals, health and SK schedules, and open incidents. Each total is returned only when the Captain holds that queue's permission. The responsive Captain overview links each count to its workspace and exposes no resident or incident details in the summary. Apply after `0180_captain_barangay_office_settings.sql`; hosted database behavior has not been verified.

Migration `0182_captain_fine_grained_membership_permissions.sql` lets Captains place or clear a deny override only for a permission already assigned to a non-Captain member's role. It cannot grant permissions beyond the role. Self and Captain overrides are rejected, and every change is recorded with the permission key in a tenant-scoped audit history. The responsive Staff & access page shows the role permissions and current overrides. Apply after `0181_captain_review_queue_summary.sql`; hosted database behavior has not been verified.

Migration `0183_snapshot_issued_document_signatory.sql` stores the configured signatory name and title on each newly issued document so later office-setting changes do not alter the issuance history. Existing records remain blank because their historical signatory cannot be inferred. The document queue displays the snapshot and explicitly identifies it as a record rather than a digital signature. Apply after `0182_captain_fine_grained_membership_permissions.sql`; hosted database behavior has not been verified.

Migration `0184_complete_captain_review_queue_summary.sql` extends the Captain's aggregate-only review summary with submitted SK project proposals and submitted public accomplishment summaries. Counts are limited to the Captain's tenant and to items the current Captain did not author, matching the independent-review rules. The responsive overview links each count to its review workspace. Apply after `0183_snapshot_issued_document_signatory.sql`; hosted database behavior has not been verified.

Migration `0185_manual_subscription_plan_requests.sql` adds a Captain-submitted paid-plan request queue and a platform-admin review flow. Captains can browse active paid plans and request one without entering payment details; only a platform administrator can record manual payment confirmation and activate the requested plan, or decline it with a reason. Activation uses the existing audited subscription update path. The Captain and Super Admin pages are responsive, and administrators can still end or suspend subscriptions manually. No online payment processing is added. Apply after `0184_complete_captain_review_queue_summary.sql`; hosted database behavior has not been verified.

Migration `0186_simple_subscription_feature_access.sql` defines four plan switches (core services, finance, community programs, and public safety). The platform plan editor saves these as booleans, the workspace hides modules excluded by the current plan, and `has_tenant_permission` enforces the same feature boundary on permission-checked database operations while preserving each user's role permissions. Free, trial, active, and in-grace-period subscriptions can use their enabled plan features. Existing plans without these feature switches retain access until an administrator saves them, avoiding an unexpected lockout. Membership management, plan requests, and support remain available so Captains can restore or request access. Apply after `0185_manual_subscription_plan_requests.sql`; hosted database behavior has not been verified.

Migration `0187_restore_subscription_metadata_only.sql` temporarily restored the previous metadata-only behavior for plan entitlements. Migration `0188_reenable_simple_subscription_feature_access.sql` reapplies the four-group subscription feature controls from `0186`, including the workspace navigation filters and database authorization policies. Apply `0187` and `0188` after `0186` in filename order; for a complete current setup, apply every migration listed in `supabase/migrations` as described above. Hosted database behavior has not been verified.

Migration `0189_existing_barangay_captain_invitation.sql` adds a Super Admin flow for issuing a Captain invitation to an existing active barangay by code. The email-bound invitation must be accepted by the signed-in matching account before it receives tenant membership; any reactivation of that account's inactive membership is recorded in membership access history. This is separate from plan assignment. Apply after `0188`; hosted database behavior has not been verified.

Migration `0200_captain_meeting_resolution_review_summary.sql` adds a permission-scoped aggregate count of draft resolutions to the Captain review queue. Migration `0201_meeting_resolution_approval_notifications.sql` adds a private in-app approval notice for each resolution's proposer, respecting the existing meeting-update preference. Migration `0202_independent_meeting_resolution_approval.sql` prevents authors from approving their own resolutions and aligns the queue count and meeting UI with that rule. Apply migrations `0200` through `0202` in order; hosted database behavior has not been verified.

Migration `0203_independent_meeting_minutes_review.sql` stores the minutes draft author separately from the latest editor and requires a different authorized meeting manager to mark a saved draft reviewed. The UI mirrors the server rule. Apply after `0202`; hosted database behavior has not been verified.

Migration `0204_meeting_resolution_notice_destination.sql` adds a proposer-scoped lookup so approval notices can navigate to the corresponding meeting page without exposing other users' resolution records. Apply after `0203`; hosted database behavior has not been verified.

Migration `0205_captain_independent_schedule_review_counts.sql` aligns Captain health outreach and SK event review counts with the database rule that prevents creators from reviewing their own schedules. The responsive review controls also disable both review decisions for the creator. Apply after `0204`; hosted database behavior has not been verified.

Migration `0206_independent_residency_verification.sql` prevents staff from verifying or rejecting resident records they created and excludes those records from their actionable Captain residency count. The resident table checks record authorship and hides review controls from the creator; the database remains authoritative. Apply after `0205`; hosted database behavior has not been verified.

Migration `0207_independent_document_request_processing.sql` prevents an account linked to a document request from reviewing, approving, issuing, releasing, or revoking its own request or issued document. Requesters retain the ability to withdraw pending requests and resubmit rejected ones. The Captain's document queue count excludes their own requests, and the responsive request cards explain when another staff member must process them. Apply after `0206`; hosted database behavior has not been verified.

Migration `0208_secretary_actionable_review_queue.sql` adds a Secretary-specific, permission-scoped summary for residency verification, profile corrections, document requests, meeting resolutions, and meeting minutes. Counts omit records the current user cannot independently review, and the Secretary overview links the summaries to their existing responsive workspaces. Apply after `0207`; hosted database behavior has not been verified.

Migration `0209_treasurer_submission_follow_up.sql` adds a private Treasurer summary of their own draft budgets, submitted transactions, pending budget amendments, and pending transaction adjustments. It reveals no other user's submission details and links to Finance; the generic dashboard no longer mislabels the Treasurer's own finance entries as items to review. Apply after `0208`; hosted database behavior has not been verified.

Migration `0210_kagawad_action_item_summary.sql` adds a Kagawad-only dashboard summary of the signed-in member's open, in-progress, blocked, and overdue tasks in active committees. It does not reveal other members' assignments and links to the existing Committees workspace. Apply after `0209`; hosted database behavior has not been verified.

Migration `0211_kagawad_meeting_participation_summary.sql` adds a Kagawad-only summary of scheduled meetings where the signed-in member is an invited attendee and has not yet recorded attendance, including meetings currently inside their self check-in window. It exposes aggregate counts only and links to Meetings. Apply after `0210`; hosted database behavior has not been verified.

Migration `0212_kagawad_project_contribution_history.sql` adds a Kagawad-only, paginated history of the signed-in member's own project progress reports and milestones. It returns project title and status only for entries authored by that Kagawad. The Projects page shows this responsive personal history. Apply after `0211`; hosted database behavior has not been verified.

Migration `0213_kagawad_assigned_action_item_queue.sql` adds a role-checked, searchable and paginated queue of the signed-in Kagawad's assigned committee tasks, with status filtering. The Committees page allows updates only through the existing assigned-member status RPC. Apply after `0212`; hosted database behavior has not been verified.

Migration `0214_kagawad_action_item_due_filters.sql` extends the Kagawad assigned-task queue with server-side overdue and next-seven-days due filters, excluding completed work from those date filters. The Committees page exposes the filters alongside status and search controls. Apply after `0213`; hosted database behavior has not been verified.

Migration `0215_kagawad_invited_meeting_queue.sql` adds a role-checked, paginated list of the signed-in Kagawad's upcoming invited meetings and reports whether the self check-in window is open or attendance is already recorded. The Meetings page adds a responsive personal invitation panel and only offers Kagawads check-in from an eligible invitation. Apply after `0214`; hosted database behavior has not been verified.

Migration `0216_kagawad_action_item_progress_notes.sql` adds private, append-only progress notes for a Kagawad's own assigned action items. The Committees page shows the note history and composer inline; database functions enforce assignment, active committee membership, and note length. Apply after `0215`; hosted database behavior has not been verified.

Migration `0217_committee_manager_progress_note_visibility.sql` lets active committee managers read progress notes attached to tasks in committees they manage, while Kagawad note creation remains restricted to the assigned member. The committee task cards add a manager-only history view. Apply after `0216`; hosted database behavior has not been verified.

Migration `0218_committee_task_progress_note_responses.sql` adds manager-authored responses to task progress histories. Committee managers can respond only within active committees they manage, and the assigned Kagawad can continue adding notes to their own task. The manager note history includes a responsive response form. Apply after `0217`; hosted database behavior has not been verified.

Migration `0219_notify_kagawad_of_manager_task_response.sql` sends an in-app Community updates notice to an active task assignee when a committee manager adds a response. Access and read status are limited to the current assignee, and repeated responses update the task's existing notice. The notice opens the Committees workspace. Apply after `0218`; hosted database behavior has not been verified.

Migration `0220_notify_committee_managers_of_kagawad_progress.sql` alerts authorized committee managers when an assigned Kagawad posts progress or a blocker note. Manager and assignee notifications use separate inbox types, refresh on subsequent notes, and are visible only to the active assignee or a committee manager. The app routes either alert to Committees. Apply after `0219`; hosted database behavior has not been verified.

Migration `0221_committee_task_notification_context.sql` provides a minimal task lookup for the active assignee or an active committee manager. Community update alerts now open the specific task conversation, with a response or progress composer limited by the returned role flags and enforced again by the write RPC. Apply after `0220`; hosted database behavior has not been verified.

Migration `0222_kagawad_task_status_history.sql` adds an indexed, paginated status-change history for the signed-in Kagawad's currently assigned tasks. The Committees page exposes it alongside each task's progress notes; the lookup is limited to active Kagawad assignees. Apply after `0221`; hosted database behavior has not been verified.

Migration `0223_kagawad_blocker_reports.sql` lets an active Kagawad atomically mark their assigned task blocked, save the reason in the task progress thread, and trigger the existing manager notification. The Committees page requires a reason before reporting a newly blocked task. Apply after `0222`; hosted database behavior has not been verified.

Migration `0224_kagawad_task_completion_summaries.sql` requires an active Kagawad to include a completion summary when completing an assigned task. Status, audit event, and summary are saved together, and the existing task progress notification alerts committee managers. The responsive Committees page provides the summary form. Apply after `0223`; hosted database behavior has not been verified.

Migration `0225_committee_task_due_date_requests.sql` lets active Kagawads request a different future due date for their assigned, unfinished tasks. The request is private, manager review is paginated and permission-checked, approvals update the task and audit event, declines require a note, and new requests notify committee managers in Community updates. Kagawads see their latest request and decision on the task card. Apply after `0224`; hosted database behavior has not been verified.

Migration `0226_kagawad_due_date_request_history.sql` adds a paginated, requester-only history of due-date proposals and manager decisions for each assigned task. The responsive task card shows prior dates, reasons, decision notes, and submission times, and allows a new request after the latest request has been reviewed. Apply after `0225`; hosted database behavior has not been verified.

Migration `0227_kagawad_meeting_attendance_history.sql` adds a paginated, Kagawad-only history of meetings that the signed-in member was invited to, with only their own attendance status and record time. The Meetings page displays this history beside upcoming invitations. Apply after `0226`; hosted database behavior has not been verified.

Migration `0228_kagawad_attendance_correction_requests.sql` lets a Kagawad request a correction to their own attendance for a past invited meeting. Officials with `attendance.manage` can approve or decline from a paginated queue; approvals update the official attendance record and audit event, while declines require a review note. The Meetings page includes requester history and review controls. Apply after `0227`; hosted database behavior has not been verified.

Migration `0229_attendance_correction_notifications.sql` sends an in-app Community updates notice to attendance managers when a Kagawad submits a correction and to the requester when a decision is made. Notification visibility and read status are limited to the requester and active members authorized to manage attendance. Apply after `0228`; hosted database behavior has not been verified.

Migration `0230_kagawad_meeting_availability_responses.sql` lets invited Kagawads RSVP as attending or unavailable before a scheduled meeting. The private paginated invitation queue includes each member's own response, while meeting and attendance managers can view aggregate response totals. RSVP does not create or update attendance records. Apply after `0229`; hosted database behavior has not been verified.

Migration `0231_kagawad_meeting_rsvp_history.sql` records meaningful RSVP changes in an append-only event history and adds a private, paginated view of the signed-in Kagawad's own responses. The Meetings page displays response history with meeting dates and submission times, distinct from attendance. Apply after `0230`; hosted database behavior has not been verified.

Migration `0232_kagawad_task_assignment_history.sql` records new assignments and assignment changes for committee action items, backfills existing assignments, and provides a private paginated history for each Kagawad. The Committees page shows each task's current status and due date with its assignment time, including tasks later transferred or in archived committees. Apply after `0231`; hosted database behavior has not been verified.

Migration `0233_kagawad_task_assignment_notifications.sql` alerts an active assignee when a committee action item is assigned to them. The notice opens the task conversation, and read access is limited to the current assignee. Apply after `0232`; hosted database behavior has not been verified.

Migration `0234_searchable_kagawad_project_contributions.sql` adds a role-checked, paginated search over the signed-in Kagawad's own project updates, with text, update-type, and inclusive Manila-local date filters. The Barangay projects page exposes responsive filters in the contribution history. Apply after `0233`; hosted database behavior has not been verified.

Migration `0235_fix_database_policy_and_workflow_tests.sql` restores authenticated execution of the subscription feature helper required by RLS while restricting its results to the caller's active barangay and known feature keys. It also grants only the safe columns needed to read resident correction history. Apply after `0234`; hosted database behavior has not been verified.

Migration `0236_searchable_kagawad_task_assignment_history.sql` adds a private, paginated search over the signed-in Kagawad's assignment history, including tasks later transferred away or kept in archived committees. The Committees page filters by task or committee text, current task status, and inclusive Manila-local assignment dates. Apply after `0235`; hosted database behavior has not been verified.

Migration `0237_kagawad_completed_work_history.sql` provides a private, paginated history of completion summaries written by the signed-in Kagawad. It remains available after reassignment or committee archival and does not expose other members' task notes. The Committees page displays the history in a responsive panel. Apply after `0236`; hosted database behavior has not been verified.

Migration `0238_kagawad_completed_work_dashboard_count.sql` adds the signed-in Kagawad's own completed-work total to the private action-item dashboard summary. The count includes only completion events recorded by that Kagawad with their own summary and links to the completed-work history. Apply after `0237`; hosted database behavior has not been verified.

Migration `0239_searchable_kagawad_rsvp_history.sql` adds private, paginated search to the signed-in Kagawad's RSVP history, with meeting-title, response, and inclusive Manila-local meeting-date filters. The Meetings page keeps RSVP separate from attendance and leaves the attendance-correction meeting selector independent. Apply after `0238`; hosted database behavior has not been verified.

Migration `0240_kagawad_meeting_attendance_summary.sql` extends the private Kagawad meeting overview with counts of the signed-in member's own present, absent, and excused attendance records. The overview links each count to Meetings and exposes only aggregate totals. Apply after `0239`; hosted database behavior has not been verified.

Migration `0241_committee_task_reassignment.sql` lets committee managers reassign action items to active members of the same committee. The permission-checked RPC preserves the assignment audit history and existing assignee notification trigger; a paginated member picker is available on each manager task card. Apply after `0240`; hosted database behavior has not been verified.

Migration `0242_kagawad_pending_rsvp_dashboard_count.sql` adds a private count of upcoming invitations that still need the signed-in Kagawad's response to the meeting participation summary. The dashboard links the count to Meetings. Apply after `0241`; hosted database behavior has not been verified.

Migration `0243_kagawad_upcoming_task_deadline_count.sql` adds a private count of the signed-in Kagawad's unfinished committee tasks due today or within the next seven days. The dashboard links the count to Committees. Apply after `0242`; hosted database behavior has not been verified.

Migration `0244_kagawad_assignment_history_context.sql` snapshots the assigner and previous assignee on future task assignment events, backfills prior-assignee context where the event history supports it, and extends the private Kagawad assignment-history RPC with those names. Earlier events retain unknown assigner details when no reliable actor was stored. Apply after `0243`; hosted database behavior has not been verified.

Migration `0245_manager_meeting_rsvp_roster.sql` adds a searchable, paginated directory of individual RSVP responses for a meeting. Only members with meeting-management or attendance-management permission can access invitee names and response times; the roster includes response-state filtering. Apply after `0244`; hosted database behavior has not been verified.

Migration `0246_kagawad_project_update_notifications.sql` notifies active project managers in Community updates when an active Kagawad adds a project progress report or milestone. Notifications link to Projects, refresh per project, and are visible only while the recipient has project-management permission and active barangay access. Apply after `0245`; hosted database behavior has not been verified.

Migration `0247_kagawad_project_contribution_permission.sql` separates Kagawad project contributions from project administration. Kagawads can add progress reports and milestones to active or paused projects with `project.update`; creating projects and changing project status remain controlled by `project.manage`. It also resolves project-update notification recipients from each active recipient's role permission and membership override, rather than the update author's permissions. Apply after `0246`; hosted database behavior has not been verified.

Migration `0248_kagawad_invited_meeting_agenda.sql` adds an on-demand agenda lookup for a signed-in active Kagawad who is explicitly invited to that upcoming scheduled meeting. The invitation card loads the agenda only when opened, and the RPC does not expose other meetings or invitees. Apply after `0247`; hosted database behavior has not been verified.

Migration `0249_private_meeting_record_drafts.sql` limits draft meeting minutes and unapproved resolutions to members with `meeting.manage`. Other meeting readers and invitees can continue to read only reviewed minutes and approved resolutions. Meeting record query keys include the signed-in user to avoid reusing another account's cached records. Apply after `0248`; hosted database behavior has not been verified.

Migration `0250_kagawad_meeting_rsvp_withdrawal.sql` lets an invited Kagawad withdraw a response before a scheduled meeting starts. The active RSVP is removed, a `withdrawn` history event is retained, and the searchable RSVP history can filter for withdrawals. The meeting summary and Kagawad dashboard counts refresh after a response change. Apply after `0249`; hosted database behavior has not been verified.

Migration `0251_barangay_project_update_responses.sql` adds a private response thread to barangay project updates. Project managers can respond to another member's update, while the author and project managers can read the thread; the author receives a Community update notification. Apply after `0250` before using this workflow; hosted database behavior has not been verified.

Migration `0252_paginated_barangay_project_update_responses.sql` adds a bounded, permission-checked page RPC for project update replies. Apply after `0251` before using response pagination; hosted database behavior has not been verified.

Migration `0253_project_response_notification_target.sql` adds an author-only context lookup used by manager-reply notifications to resolve the project and current project, update, and response pages. Apply after `0252` to enable direct notification navigation; hosted database behavior has not been verified.

Migration `0254_attendance_correction_notification_target.sql` resolves attendance correction notices to the requester's own paginated history or an authorized reviewer's pending queue. The lookup enforces active membership and requester or attendance-management access. Apply after `0253` before using direct navigation; hosted database behavior has not been verified.
Migration `0307_serialize_protected_account_removals.sql` serializes Auth account deletion and staged platform Captain removal with a transaction-scoped advisory lock. This makes the last-platform-administrator and last-active-Captain checks safe against simultaneous account-removal transactions while preserving the cleanup and audit workflow from `0304`–`0306`. Apply migrations in filename order and verify the concurrency behavior in an isolated database before relying on it in production.

Migration `0308_guard_auth_soft_deletion.sql` applies the same guards and cleanup when Supabase soft-deletes an Auth account by setting `auth.users.deleted_at`. It retains the hard-delete trigger and serializes the soft-delete transition with migration `0307`'s advisory lock. If a staged platform removal is interrupted before its completion event is written, memberships stay suspended and visible to the retry queue while their permission rows are removed. Verify both Auth deletion paths and the interrupted-removal retry in an isolated project before relying on them in production.

Migration `0309_use_removal_email_snapshot_for_retry.sql` makes the platform Captain directory use the original email captured in an incomplete removal event instead of an Auth email that may have been anonymized by soft deletion. This keeps the pending row searchable and clearly identifiable for authorized administrators while the removal audit awaits retry.

Migration `0310_preserve_storage_objects_on_auth_deletion.sql` clears nullable `storage.objects.owner_id` and legacy `owner` references before a hard Auth deletion, only for KABALIKAT's `barangay-archive`, `financial-receipts`, and `incident-evidence` buckets. It preserves the files and their application records; other Storage buckets are untouched. It relies on the existing record-scoped policies for these private buckets. Confirm the hosted Storage schema and test file access in an isolated project before applying this migration to production.

Migration `0311_require_auth_removal_before_completion.sql` prevents the service-only Captain-removal audit RPC from marking a removal complete while the Auth identity is still active. It permits completion only after the Auth row is absent or soft-deleted, and preserves idempotent retries. Verify both paths in an isolated project before relying on the audit status.

Migration `0312_allow_reasonless_removal_retries.sql` lets a platform administrator retry an already-audited Captain account removal without entering a second reason. New removals still require a 3–1000 character reason, and retries preserve the original removal event and reason.
