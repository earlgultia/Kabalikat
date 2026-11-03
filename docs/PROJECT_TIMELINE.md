# KABALIKAT Project Timeline and Status

**Status checked:** 2 November 2026
**Estimated implementation completion:** **74%**
**Current position:** Captain workspace completion, followed by Secretary, Treasurer and Kagawad workflow review; Phase 7 hardening remains.

## How to read the percentage

The 74% figure is a rough estimate of the seven roadmap phases in the project specification, giving each phase equal weight. It measures implemented scope, not elapsed time, production readiness, or verified security. A phase is not considered fully done just because its interface exists. Database migration and authorization verification are still outstanding for this workspace.

| Phase | Scope | Estimate | Current state |
| --- | --- | ---: | --- |
| 1. Foundation | Authentication, tenant roles and permissions, database foundation | 85% | Core implemented; full migration and RLS verification is pending. |
| 2. Core barangay operations | Onboarding, residents, announcements, documents, meetings and attendance | 92% | Announcement audience targeting, notification preferences, resident feedback and staff follow-up, request withdrawal/history, and staff-reviewed resident profile correction requests are implemented; live database and policy checks are pending. |
| 3. Archives and productivity | Archive, meeting records, QR attendance, reports and OCR | 85% | Archive and productivity tools implemented; no OCR provider is configured. |
| 4. Finance and projects | Budgets, approvals, receipts, committees and project tracking | 90% | Finance and project workflows implemented; database verification is pending. |
| 5. Specialized workspaces | SK, health, safety, incident workflows and referrals | 83% | SK proposals, independently reviewed events, creator revision/resubmission, reasoned cancellation, early completion and rescheduling with public change history, date-filtered queues and exports, and public accomplishment summaries with activity history; BHW proposals and review, schedule cancellation and rescheduling with public change history; a unified calendar with downloadable upcoming published SK and health outreach schedules; searchable status-filtered BHW and SK event queues; searchable Tanod patrol shifts; incidents with verified handoff logging; advisories; published emergency contacts and evacuation centers with audit history; controlled referrals; and restricted incident evidence implemented. Clinical workflows and restricted youth registry/programs remain. |
| 6. Subscriptions and integrations | Plans, billing, notifications, OCR/AI providers and support | 60% | Manual Captain plan requests and Super Admin activation are implemented without online payments. Four administrator-controlled feature groups are enforced in workspace navigation and permission-checked database actions. Email/SMS and provider integrations remain. |
| 7. Hardening and pilot | Security verification, accessibility, performance, backups, pilot and training | 30% | SPA deployment routing and browser security headers are configured; GitHub Actions is configured for lint, TypeScript checks, Vitest, production builds, isolated migration application, and pgTAP checks. Keyboard skip links, reduced-motion preferences, keyboard-accessible mobile navigation, and consistent dialog focus handling are supported. Full accessibility and cross-tenant review, successful CI database verification, recovery, pilot and operational reviews remain. |

## Role-focused completion sequence

| Order | Workspace | Current focus | Next step |
| ---: | --- | --- | --- |
| 1 | Captain | Membership role/status management, audited member offboarding, role-bounded permission overrides, barangay office settings, a permission-aware review queue covering SK project and accomplishment review, issuance-time signatory snapshots, manual paid-plan requests, and Super Admin invitations for a Captain account on an existing barangay are available in responsive pages (migrations `0179`-`0192`). | Review the Captain's remaining administration workflows and close gaps before moving to other roles. |
| 2 | Secretary | Existing authorized workflows are available; a dedicated role-by-role completeness review is pending. | Review records, meetings, announcements, documents, archives, and resident follow-up. |
| 3 | Treasurer | Finance tools exist; a dedicated role-by-role completeness review is pending. | Review budget, transaction, approval, export, and audit paths. |
| 4 | Kagawad | Committee task tracking, a private assigned-task summary and searchable queue, due-date filters, progress notes with manager review, response, and two-way in-app alerts, invited-meeting counts and actionable invitations, and a personal project contribution history are implemented (migrations `0210`-`0220`). | Review project contribution and meeting follow-through, then verify role scoping and UI access. |

## Subscription payment approach

KABALIKAT does not process online payments. Captains can request an available paid plan; the Super Admin confirms payment through the separately arranged GCash process and then activates the requested plan. The Super Admin can also cancel or suspend a subscription. Prices and GCash recipient details must be communicated directly by ArkByte; they are not stored in the application.

## Milestone timeline

This is a dependency-based timeline rather than a calendar schedule. No delivery dates are assigned because durations, staffing, database access and pilot availability have not been confirmed.

| Order | Milestone | Status | Exit condition |
| ---: | --- | --- | --- |
| 1 | Foundation and core workflows (Phases 1-4) | Implemented; verification pending | Run the new isolated GitHub database workflow, resolve migration or pgTAP failures, and expand tests for later modules. |
| 2 | Specialized workspaces (Phase 5) | In progress | BHW and SK scheduling, project proposals, and reviewed public accomplishment summaries are implemented. Decide whether clinical workflows or youth registry/programs are required; define privacy controls first. |
| 3 | Subscription and provider integrations (Phase 6) | In progress | Approve pricing, entitlements and continuity rules; select providers and configure them before enabling payments, email/SMS, OCR or AI. |
| 4 | Security and accessibility review (Phase 7) | In progress | Automated app lint, typecheck, and build checks are configured. Review RLS/RPC boundaries across tenants, test role access paths, and complete accessibility and performance reviews. |
| 5 | Operations and pilot readiness (Phase 7) | Not started | Rehearse backup restoration using the documented runbook; verify privacy and legal notices, monitoring, incident response, deployment settings, user training and pilot sign-off. |
| 6 | Authorized pilot | Not started | Run with approved users and non-sensitive or explicitly authorized data; record and resolve pilot issues before wider use. |

## What is currently working in the codebase

- Public landing page with plans and a plain-language privacy summary.
- Invitation-based sign-in and multi-barangay role/permission foundation.
- Invitation account creation collects a display name, and users can update their own name in Account Security. The name appears in workspace greetings and account navigation; official resident records remain separate.
- Resident and household records, resident correction requests and owner-only personal-data export, private feedback with staff replies, announcements, document services, meetings, attendance and private archive.
- Finance approvals, receipts, committee tasks, SK project proposals with activity history and independently reviewed public accomplishment summaries, general barangay project tracking, incidents, patrol shifts, disaster advisories, and audited emergency contact/evacuation center listings.
- Platform support portal with searchable paginated triage and on-demand conversation/history loading, admin-managed plan/subscription records with review indicators and CSV exports, controlled audited inter-barangay referrals, BHW outreach scheduling with Captain review, reasoned cancellation and rescheduling history, and SK event scheduling with Captain review, revisions, cancellation, rescheduling, and public change history; plus a read-only calendar for upcoming published community events.
- Support requesters can reopen a resolved ticket with a required update; the reopening message and status transition are recorded together. Closed tickets remain terminal.
- The Super Admin support queue includes status totals and one-tap status filters based on an aggregate-only database function.
- The support queue highlights new or in-progress requests without activity for at least three days and provides a paginated attention filter.
- Requesters receive in-app updates for support team replies and ticket status changes; internal notes remain private and do not create requester notifications.
- Vercel SPA deep-link rewrite and browser security headers.
- Installable PWA app shell with a clear offline notice, reconnect prompt, and user-controlled updates; secure records and mutations still require a live connection and are not queued for later sync.
- Community update notifications link to the matching paginated announcement, advisory, document request, feedback item, or profile correction request when the signed-in role can access it.
- GitHub Actions CI for locked dependency installation, lint, TypeScript checks, Vitest, and production builds on pushes and pull requests.
- An isolated Supabase CI job that applies all migrations and runs the existing pgTAP suites without hosted-project credentials; its first GitHub run is still pending.
- The platform activity page records high-level barangay onboarding and subscription changes without copying tenant records. Platform audit rows are append-only, actor attribution is snapshotted, and updates, deletes, and truncation are blocked; the UI supports date/action/actor search, paginated export, event-reference copying, and matching-result counts.

## Main remaining work

1. **Verify the database:** The isolated CI workflow applies migrations and runs pgTAP suites, including role-targeted announcement, resident profile correction, private feedback, public document verification, platform subscription controls, and owner-scoped personal export coverage. Add resident directory, document queue, finance paging, archive search and folder paging, meeting resolution/member search, community calendar paging/date filters, announcement search/date filters, incident report date/severity/assignment filters and manager queue breakdown, incident assignment and status notifications, patrol assignment, cancellation, rescheduling, start, and completion notifications, completion handover, filtered patrol shift history, patrol coverage summary, platform directory/subscription paging, platform onboarding and subscription activity history, support queue/thread, committee member-picker, referral paging, Tanod picker, meeting attendee-directory, document type history, SK accomplishment paging, project-history, finance budget paging, feedback activity paging, complete personal export, health outreach search/date filters, attendance aggregate and summary, revision, cancellation, audit history, outreach completion/early completion/attendance correction/cancellation/private review/publication notification, SK event reasoned early completion and notification coverage, review queue summary, health review submission, health outreach rescheduling/history/notification summary, SK event search/date filters, review submission and publication notification, SK event queue summary coverage, patrol shift search, searchable meeting schedule/date filters, meeting status history, meeting schedule/status notification coverage, subscription plan metadata editing, existing inactive plan assignment behavior, review-queue summary alignment, upcoming-trial filter/count alignment, plan usage counts, plan-change field audit coverage, subscription deadline preservation, and platform activity date filters, actor search/snapshot, actor-name protection, update/delete/truncate protection, and snapshot-bounded export paging to pgTAP. Review the first GitHub run; its status has not been verified yet.
2. **Complete agreed specialist modules:** Clinical BHW workflows and restricted youth registry/program workflows require explicit data minimization and access rules. Current BHW and SK event features only schedule public community events.
3. **Decide integration behavior:** Billing, plan enforcement, email/SMS, OCR and AI require product decisions, real providers, server-side secrets, and user-facing failure handling.
4. **Complete hardening:** Cross-tenant/RLS review, accessibility and performance checks, backup restore, operational monitoring, and incident response procedures.
5. **Prepare and run a pilot:** Confirm privacy/legal notices and retention policy, deployment and support ownership, user training, and pilot acceptance criteria. Rehearse and record backup restoration using the [recovery runbook](BACKUP_RECOVERY.md).

Health outreach rescheduling: Migration `0132_health_outreach_rescheduling.sql` adds permission-checked schedule updates for published outreach, snapshots public old/new logistics and the reason, delivers preference-aware notices, and exposes a paginated change history in the outreach page. Apply after `0131_health_outreach_future_schedule_guard.sql`; hosted database behavior has not been verified.

Health outreach notice reach: Migration `0133_health_outreach_notification_summary.sql` adds authorized aggregate counts for publication, schedule change, cancellation, and completion notices. Managers can expand the notification reach panel on an outreach card to see sent and read totals. Apply after `0132_health_outreach_rescheduling.sql`; counts do not identify recipients or represent attendance.

Early outreach completion: Migration `0134_health_outreach_early_completion.sql` and the outreach card form let a manager close a started event before its planned end, record an aggregate attendance count and required reason, and notify opted-in members. The staff activity log distinguishes early completion from completion after the scheduled end.

Attendance correction: Migration `0135_health_outreach_attendance_correction.sql` adds a reasoned manager correction action for completed events. The form records only a corrected aggregate total; the prior and new totals and reason appear in the staff activity log.

Health outreach date filters: Migration `0136_health_outreach_start_date_filters.sql` adds local-date start-window filtering before database pagination. Queue pages, summary cards, and full matching CSV exports use the same window.

Recent frontend verification: typecheck, lint, and production build passed after the notification deep-link and PWA connection-status updates. These checks verify the client build only. They do not apply migrations, prove hosted RLS behavior, or replace pilot and privacy review.

The system is **not production-ready** until the database checks, deployment controls, privacy review and pilot gates are complete. Passing frontend build or lint checks alone does not establish database security.

## Updating this status

Update phase estimates and milestone states when a feature is implemented and its stated verification gate has evidence. Recalculate the overall estimate as the unweighted average of the seven phase estimates above, rounding to the nearest whole percent. Keep the estimate labeled as approximate until the specification is decomposed into a verified task inventory.


Finance ledger work: Migration `0082_paginated_financial_transactions.sql` adds a 25-entry paginated UI, current-page linked adjustment/receipt loading, accurate complete budget usage through a permission-checked RPC, and full date-range report exports fetched in bounded batches. Apply and verify the migration before treating database behavior as confirmed.

Community calendar work: Migration `0083_paginated_community_calendar.sql` adds a combined searchable page for upcoming published SK and health events. The interface displays 20 entries per page while ICS downloads include all matching events. Apply and verify the migration before treating database behavior as confirmed.

Archive work: Migration `0084_paginated_archive_search.sql` replaces the UI's capped search path with a permission-checked 25-file page. The archive can now reach all matching results while preserving private storage and short-lived signed downloads. Apply and verify the migration before treating database behavior as confirmed.

Meeting records work: Migration `0085_paginated_meeting_resolutions.sql` adds stable resolution ordering and 25-entry paging in meeting details. PDF export gathers all resolutions before printing so pagination does not truncate the official report. Apply and verify the migration before treating database behavior as confirmed.

Meeting invite work: Migration `0086_paginated_meeting_member_picker.sql` provides a server-side search of active workspace members. Organizers can search and select invitees in 25-entry pages without loading the entire membership directory. Apply and verify the migration before treating database behavior as confirmed.

Platform directory work: Migration `0087_paginated_platform_barangay_directory.sql` moves Super Admin barangay search and status filtering to an admin-checked page query, adds aggregate tenant counts, and keeps CSV export complete through bounded page requests. Apply and verify the migration before treating hosted database behavior as confirmed.

Subscription workspace work: Migration `0088_paginated_platform_subscriptions.sql` adds admin-checked server-side search, status filtering, and 25-row pages, plus aggregate trial, past-due, suspended, and review counts. The overview dashboard no longer downloads the complete subscription table. Filtered CSV export still fetches every matching row in bounded pages. Apply and verify the migration before treating hosted database behavior as confirmed.

Support queue work: Migration `0089_paginated_platform_support_queue.sql` returns the barangay name with each platform support-ticket page under an explicit administrator check. The Super Admin queue no longer fetches all tenant-directory rows to label tickets; requester-scoped reads and existing message/history controls continue using their current RLS policies. Apply and verify the migration before treating hosted database behavior as confirmed.

Support thread work: Migration `0090_paginated_support_threads.sql` adds stable indexes for message and status history paging. Opening a conversation or history now loads the latest 25 entries, with controls to retrieve older entries while maintaining chronological display and existing visibility policies. Apply and verify the migration before treating hosted database behavior as confirmed.

Committee assignment work: Migration `0091_paginated_committee_member_picker.sql` adds a server-side searchable list of active members who are not yet assigned to the selected committee. The picker loads only when opened, pages 25 results, and verifies `committee.manage` in the database. Apply and verify the migration before treating hosted database behavior as confirmed.

Referral paging work: Migration `0092_paginated_interbarangay_referrals.sql` replaces full referral and activity reads with authorized 25-item pages. The referral activity audit records only rows returned on the current page, while per-referral histories load only when opened. Apply and verify the migration before treating hosted database behavior as confirmed.

Referral destination work: Migration `0093_paginated_referral_destinations.sql` pages and searches active receiving barangays under the origin workspace's `referrals.create` permission. The creation form lets staff search, select, and page through destination options instead of loading the complete barangay list. Apply and verify the migration before treating hosted database behavior as confirmed.

Tanod assignment work: Migration `0094_paginated_tanod_assignment_picker.sql` replaces full incident and patrol assignee reads with a permission-checked, searchable picker that returns 25 active Tanods at a time. Incident assignment and patrol scheduling both use the same responsive picker. Apply and verify the migration before treating hosted database behavior as confirmed.

Meeting privacy and performance work: Migration `0095_meeting_scoped_attendee_directory.sql` limits meeting detail name lookup to the selected meeting's attendee roster and requires `meeting.manage`. The UI no longer downloads every active barangay member just to label attendance records. Apply and verify the migration before treating hosted database behavior as confirmed.

Document setup history work: Migration `0096_paginated_document_type_activity.sql` pages configuration audit history in groups of 25 and fetches it only when the history panel is opened. Apply and verify the migration before treating hosted database behavior as confirmed.

SK transparency work: Migration `0097_paginated_sk_accomplishments.sql` pages published accomplishments and the internal review queue separately, keeps year filtering available, and retains complete CSV exports through bounded fetches. Apply and verify the migration before treating database behavior as confirmed.

Project history work: Migration `0098_paginated_project_progress_history.sql` pages barangay and SK project progress, plus SK audit activity. The UI loads each history only when opened and leaves the project summary list available without fetching all updates. Apply and verify the migration before treating database behavior as confirmed.

Finance budget work: Migration `0099_paginated_finance_budgets.sql` pages annual budgets and amendment reviews, scopes expense totals to the visible budget page, and shows pending-amendment state on each budget card. Transaction entry lets staff browse approved budgets page by page. Apply and verify the migration before treating database behavior as confirmed.

Feedback history work: Migration `0100_paginated_feedback_history.sql` adds stable item-scoped event ordering. The interface now loads an item's private activity history only when the resident or authorized reviewer opens it, in pages of 25. Apply and verify the migration before treating database behavior as confirmed.

Archive folder work: Migration `0101_paginated_archive_folders.sql` adds an index for stable folder ordering. Folder filters and upload destination choices load 50 at a time and retain prior options as the user browses. Apply and verify the migration before treating database behavior as confirmed.

Personal data export work: Migration `0102_complete_resident_data_export.sql` adds a private paginated feedback-export RPC. The resident export reads owned database records in batches and incident/feedback histories through bounded pages, avoiding a one-response truncation while preserving owner-scoped access. Apply and verify the migration before treating database behavior as confirmed.

Health outreach queue work: Migration `0103_searchable_health_outreach_queue.sql` adds server-side status and text filters to the existing 20-row schedule pages. The responsive queue keeps the current RLS policies through an invoker-security RPC. Apply and verify the migration before treating hosted database behavior as confirmed.

SK event queue work: Migration `0104_searchable_sk_event_queue.sql` adds server-side status and text filters to the existing 20-row event pages. The responsive queue keeps the current RLS policies through an invoker-security RPC. Apply and verify the migration before treating hosted database behavior as confirmed.

Patrol shift queue work: Migration `0105_searchable_patrol_shift_queue.sql` adds server-side status and text filters to the existing 50-row shift pages. The responsive queue preserves active and upcoming shifts first and keeps Tanod access limited by the existing row-level policies. Apply and verify the migration before treating hosted database behavior as confirmed.

Meeting schedule work: Migration `0106_searchable_meeting_schedule.sql` adds server-side search over meeting titles, locations, and agendas, plus status filtering on the existing 20-row pages. The invoker-security RPC leaves meeting visibility to the current tenant and attendee RLS policies. Apply and verify the migration before treating hosted database behavior as confirmed.

Meeting accountability work: Migration `0107_paginated_meeting_status_history.sql` adds an index for stable status-event paging. The meeting records panel exposes history only to meeting managers, loads it on demand, and pages 25 events while preserving the existing RLS boundary. Meeting report PDFs now include the complete status history and reasons alongside the minutes, attendance, and resolutions. Apply and verify the migration before treating hosted database behavior as confirmed.

Meeting maintenance work: Meeting managers can now correct a scheduled or draft meeting's title, location, date, and agenda from its card. The existing tenant RLS policy and column grants guard updates; terminal meeting status and invitee assignments remain unchanged.

Attendance reporting work: Meeting managers can review present, absent, excused, and not-recorded totals and download a UTF-8 CSV of the invitee roster and recorded attendance. Exported cells are escaped and protected against spreadsheet formula execution.

Meeting audit entry work: Attendance changes and meeting cancellation now collect required reasons in a responsive, keyboard-accessible in-app dialog instead of browser prompts. The database continues to enforce the minimum reason length and manager permissions.

Personal meeting calendar work: Attendees can download a standards-based `.ics` event from each scheduled meeting card for import into their personal calendar. The download uses the latest visible schedule and includes the agenda when present.

Meeting schedule notification work: Migration `0108_meeting_schedule_change_notifications.sql` records schedule edits and delivers in-app alerts to the active invitees, respecting each user's meeting-update preference. Opening the notice marks it read and routes to the exact meeting card; invitee-only RLS protects event details. Apply and verify the migration before treating hosted database behavior as confirmed.

Meeting status notification work: Migration `0109_meeting_status_change_notifications.sql` extends the same invitee-scoped notification flow to completed and cancelled meetings. The inbox identifies the action and uses the existing meeting-update preference. Apply and verify the migration before treating hosted database behavior as confirmed.

Meeting notification detail work: Migration `0110_meeting_notification_snapshots.sql` preserves each new event's title, location, and time. The update inbox shows the time or location that changed, even after a later schedule edit. Older pre-migration rows fall back to the current meeting details because their historical values were not stored. Snapshot access remains limited to active invitees. Apply and verify the migration before treating hosted database behavior as confirmed.

Health outreach reporting work: Migration `0111_aggregate_health_outreach_attendance.sql` lets authorized BHW staff record the total attendance count when completing a scheduled outreach. The responsive completion form stores only a bounded aggregate number, not participant names or health records. Apply and verify the migration before treating hosted database behavior as confirmed.

Health outreach summary work: Migration `0112_health_outreach_aggregate_summary.sql` adds RLS-aware counts for schedules, completions, and aggregate attendance across the current search and status filters. The dashboard presents the metrics in responsive summary cards. Apply and verify the migration before treating hosted database behavior as confirmed.

Health outreach revision work: Migration `0113_health_outreach_revision_workflow.sql` distinguishes Captain-requested changes from cancellations. BHW campaign creators can update drafts or returned proposals and resubmit them for review; server-side permission checks protect each transition and append to the restricted event history. Apply and verify the migration before treating hosted database behavior as confirmed.
Health outreach cancellation work: Migration `0114_health_outreach_cancellation.sql` enables authorized staff to cancel an upcoming or active published event with an audited reason. Active members retain read access to the cancelled schedule and see why it was cancelled; staff can search and export it with the existing schedule queue. Apply and verify the migration before treating hosted database behavior as confirmed.
Health outreach accountability work: Migration `0115_paginated_health_outreach_history.sql` adds a staff-only, permission-checked paginated event-history RPC. Each outreach card can load the action, actor, timestamp, and note on demand; event history stays hidden from regular members.
Health outreach notification work: Migration `0116_health_outreach_cancellation_notifications.sql` sends in-app alerts about published outreach cancellations to active barangay members, honors each member's health outreach notification preference, and links the alert to the cancelled schedule and its reason. No email or SMS channel is involved.
Health outreach completion work: Migration `0117_health_outreach_completion_notifications.sql` notifies active members when a published outreach is completed. The notification includes the aggregate attendance total and links to the completed schedule; the existing health outreach notification preference controls both completion and cancellation alerts.
Health outreach review work: Migration `0118_health_outreach_review_notifications.sql` sends a private in-app message to the schedule creator when a Captain requests changes. The notification carries the review note, links to the current proposal page, and remains scoped to the creator; schedule creators are blocked from reviewing their own proposals.
Health outreach publication work: Migration `0119_health_outreach_publication_notifications.sql` notifies active members when a Captain publishes a schedule. The preference setting controls delivery, and the alert opens the published schedule; the notice stays accessible if that schedule is later completed or cancelled.
Health outreach review queue work: Migration `0120_health_outreach_review_queue_summary.sql` adds awaiting-review and changes-requested counts to the responsive outreach overview. Counts follow the signed-in user's RLS-visible records and current search query.
Health outreach reviewer alert work: Migration `0121_health_outreach_review_submission_alerts.sql` notifies active members with Captain review permission when a schedule is submitted or resubmitted. Alerts deep-link to the draft's page and refresh as unread when a returned schedule is resubmitted.
SK event reviewer alert work: Migration `0122_sk_event_review_submission_alerts.sql` notifies active Captain reviewers when an SK event schedule is submitted. The alert deep-links to its draft schedule and remains private to authorized reviewers.
SK event publication work: Migration `0123_sk_event_publication_notifications.sql` sends opted-in active barangay members an in-app alert after a Captain publishes an SK event. The alert opens the published or completed schedule, and drafts or rejected proposals stay private.
SK event queue summary work: Migration `0124_sk_event_queue_summary.sql` adds search-aware status counts and responsive one-tap filters for review, published, completed, and returned/cancelled SK event schedules.

SK event revision workflow: Migration `0125_sk_event_revision_workflow.sql` adds a changes-requested state, creator edit/resubmit actions, refreshed reviewer alerts, and private Captain feedback in the community updates panel. Apply this migration after `0124_sk_event_queue_summary.sql`.

SK event cancellation: Migration `0126_sk_event_cancellation_notifications.sql` adds reasoned cancellation for published events that have not ended, an audit record, and preference-aware notifications to active barangay members. Apply after `0125_sk_event_revision_workflow.sql`.

SK event rescheduling: Migration `0127_sk_event_rescheduling.sql` adds reasoned rescheduling, prior/current schedule snapshots, audit history, and preference-aware community alerts. Apply after `0126_sk_event_cancellation_notifications.sql`.

SK event schedule history: Migration `0128_paginated_sk_event_schedule_history.sql` exposes paginated before-and-after schedule records to active members for published, completed, and cancelled events. The card loads history on demand. Apply after `0127_sk_event_rescheduling.sql`.

SK event notification reach: Migration `0129_sk_event_notification_summary.sql` adds an on-demand summary for authorized SK managers: notification counts and read counts for publication, schedule updates, and cancellation. The UI shows aggregates only; these counts do not represent RSVP or attendance. Apply after `0128_paginated_sk_event_schedule_history.sql`.

SK calendar convenience: Public SK event cards now offer an Add to calendar download for the currently published schedule. The `.ics` file uses the latest approved time and location and can be imported into common calendar apps; no extra participant data is collected.

SK schedule reporting: Authorized event managers can export all schedules matching the current status and search filters as a CSV, fetched in bounded pages. The export excludes staff and member identifiers and protects spreadsheet cells against formula execution.

SK event sharing: Published event cards can share the public title, schedule, location, and description through the device share sheet or copy the details to the clipboard. Sharing uses only the public schedule fields.

SK schedule validation: Migration `0130_sk_event_future_schedule_guard.sql` rejects new or returned draft schedules with a start time in the past and blocks approval of an already-started proposal. Creation, editing, rescheduling, and review forms give matching validation. Apply after `0129_sk_event_notification_summary.sql`.

BHW schedule validation: Migration `0131_health_outreach_future_schedule_guard.sql` requires future start times for new and returned outreach schedules and prevents publishing proposals that have already started. BHW forms and Captain review controls provide matching validation. Apply after `0130_sk_event_future_schedule_guard.sql`.

SK event early completion: Migration 0137_sk_event_early_completion.sql allows managers to close a started event early with a required reason, records the action in staff history, notifies opted-in active members, and adds sent/read totals to the manager-only notification reach panel. Apply after 0136_health_outreach_start_date_filters.sql. Hosted database behavior is not yet verified.

SK event date filters: Migration `0138_sk_event_start_date_filters.sql` applies local start-date windows consistently to paginated queue results, overview status counts, and full matching CSV exports. Clear the filter to restore the unbounded schedule view. This database change has not been applied to or verified against a hosted project.

Meeting date filters: Migration `0139_meeting_schedule_start_date_filters.sql` applies a local start-date range to the paginated meeting schedule and the manager-only CSV export. The export contains schedule fields only and leaves attendee records in their separately permission-checked workflow. Hosted database behavior has not been verified.

Community calendar date filters: Migration `0140_community_calendar_start_date_filters.sql` applies the local start-date range to both SK and health outreach calendar results and the full ICS download. The page continues to show only published schedules that are still upcoming or in progress.

Announcement queue filters: Migration `0141_announcement_search_and_date_filters.sql` adds server-side title/message search, status filters, and creation date filters to the paginated announcement feed. The UI clears filters when following a notification link, so deep links still locate the correct announcement page.

Incident report date filters: Migration `0142_incident_report_date_filters.sql` adds local report-date bounds to the incident list while preserving the existing role-visible rows and status/category/search filters. The responsive filter bar includes date controls and a clear-dates action. Private evidence remains access-controlled and is not exported.

Incident manager queue overview: Migration `0143_incident_manager_queue_breakdown.sql` adds date-aware status/category counts to the incident dashboard for users with incident management permission. The compact responsive panel returns aggregates only and includes zero-count values.

Incident assignment alerts: Migration `0144_incident_assignment_notifications.sql` sends a private in-app notice to the currently assigned Tanod. The alert routes to the incident workspace without embedding report text and is hidden from the former assignee after reassignment.

Incident status alerts: Migration `0145_incident_status_notifications.sql` sends the report creator a generic in-app alert after a status transition. The notice links to the incident workspace and exposes no report information in the notification itself.

Incident severity filter: Migration `0146_incident_severity_filter.sql` adds a server-side severity selector to the responsive incident queue, preserving the existing RLS-scoped paging and other filters.

Incident assignment queue: Migration `0148_incident_assignment_queue_filter.sql` adds responsive all, assigned-to-me, and manager-only unassigned views to the incident queue. Assignment filtering stays server-side, paginated, tenant-scoped, and under existing RLS. Migration `0147_incident_assigned_to_me_filter.sql` remains part of the required ordered history; hosted database behavior has not been verified.

Incident manager CSV export: The incident queue can export every page matching its current search, status, category, severity, assignment and date filters. The export uses the existing permission-checked, RLS-scoped paginated RPC and includes only report date, category, severity, location, summary, status and assignment state. Private evidence and details are excluded; CSV formula-leading characters are escaped.

Incident report card details: Detailed narratives are collapsed by default behind a keyboard-accessible disclosure, keeping the initial queue easier to scan on desktop and mobile.

Incident needs-attention filter: Migration `0150_incident_needs_attention_filter.sql` enables a manager-only quick view for submitted, acknowledged, or in-progress incidents. It combines with assignment, date and other filters and applies equally to the queue CSV export.

Patrol assignment alerts: Migration `0151_patrol_shift_assignment_notifications.sql` notifies the currently assigned Tanod when a patrol shift is assigned or reassigned. The generic notice opens and focuses the assigned shift in the paginated patrol queue and is hidden from former assignees; hosted database behavior has not been verified.

Patrol cancellation alerts: Migration `0152_patrol_cancellation_notifications.sql` notifies the assigned Tanod when a scheduled shift is cancelled and routes them to the cancelled shift. The notice is private and excludes the cancellation note; hosted database behavior has not been verified.

Patrol rescheduling: Migration `0153_patrol_shift_rescheduling.sql` adds a responsive Captain schedule editor for future patrol shifts, validates the revised schedule in a permission-checked RPC, records the reason and before/after times in the restricted shift log, and notifies the current assignee with a private pointer alert. Hosted database behavior has not been verified.

Patrol lifecycle alerts: Migration `0154_patrol_lifecycle_notifications.sql` notifies users with patrol management permission when an assigned Tanod starts or completes a shift. Alerts focus the shift in the patrol queue and contain no log details. Hosted database behavior has not been verified.

Patrol completion handover: Migration `0155_patrol_completion_handover.sql` requires the assigned Tanod to submit a concise shift summary before completion. The summary is saved atomically with the completion event in the restricted shift log and appears in the responsive patrol history.

Filtered patrol history: Migration `0156_filtered_patrol_shift_history.sql` adds server-side date and entry-type filters to the paginated shift log. Existing role- and assignee-scoped access remains unchanged, with compact stacked controls on mobile.

Patrol coverage overview: Migration `0157_patrol_coverage_summary.sql` adds date-scoped shift and activity totals for authorized Captains. The summary avoids personal data and is displayed in responsive cards with a date range selector.

Patrol schedule export: Captains can download every shift matching the current queue search and status filters as a spreadsheet-safe CSV. The export includes shift title, patrol area, schedule, and status, and excludes user identifiers and log contents.

Platform activity history: Migration `0158_platform_activity_log.sql` records high-level tenant onboarding and subscription changes. The Super Admin dashboard provides a searchable, paginated activity page and filtered CSV export on desktop and mobile; only platform administrators can read these summaries.

Platform activity date filters: Migration `0168_platform_activity_date_filters.sql` adds server-side date boundaries to the Super Admin activity list. The list and matching export share the selected local-day range, including all events on the chosen end date. Hosted database behavior is not yet verified.

Platform activity actor search: Migration `0169_platform_activity_actor_search.sql` lets Super Admins find platform activity by the recorded administrator name as well as barangay and action summary. Date filters and matching export remain consistent. Hosted database behavior is not yet verified.

Platform activity actor snapshots: Migration `0170_snapshot_platform_activity_actor_name.sql` captures the administrator display name when each event is written and backfills earlier events. The platform activity search and export use this stable snapshot so profile edits do not rewrite how older audit events appear. Hosted database behavior is not yet verified.

Immutable activity attribution: Migration `0171_protect_platform_activity_actor_name.sql` prevents updates to the saved actor name on existing platform activity records, preserving attribution in the audit trail. Hosted database behavior is not yet verified.

Append-only platform activity: Migration `0172_make_platform_activity_append_only.sql` blocks updates and deletes to platform activity events so saved audit entries remain intact. Hosted database behavior is not yet verified.

Platform activity truncate protection: Migration `0173_block_platform_activity_truncate.sql` rejects table-wide truncation in addition to row updates and deletes, closing the row-trigger bypass path for roles that otherwise have truncate permission. Hosted database behavior is not yet verified.

Snapshot-bounded platform activity export: Migration `0174_snapshot_platform_activity_export.sql` adds a keyset-paged RPC for the Super Admin CSV. It uses a fixed latest-event boundary and `(created_at, id)` cursors so activity created while an export runs cannot shift offset pages. The interface reports records collected as it prepares the file. Hosted database behavior is not yet verified.

Subscription plan editor: Migration `0159_platform_subscription_plan_editor.sql` adds an administrator-only RPC for editing plan names, descriptions, boolean entitlement metadata, and availability. The Super Admin plan catalog has responsive edit forms and writes a non-sensitive platform activity event. Entitlements remain catalog metadata and do not gate workspace features; the Free plan cannot be disabled.

Existing inactive subscriptions: Migration `0160_preserve_existing_inactive_plan_assignments.sql` lets administrators continue managing a subscription on its currently assigned inactive plan without offering that plan to other barangays. The responsive editor identifies the plan as inactive and preserves it as the selected value.

Subscription review queue: Migration `0161_platform_subscription_review_queue_summary.sql` aligns the “Needs review” count with its filter, including suspended accounts, elapsed trials, and past-due grace periods. Super Admins can tap the count to open the filtered queue on mobile or desktop.

Upcoming trial review: Migration `0162_platform_upcoming_trial_review.sql` shows a count and filtered queue for trials expiring within seven days. The dashboard marks the matching records for manual review without altering their status.

Plan assignment totals: Migration `0163_platform_subscription_plan_usage_counts.sql` adds an aggregate subscriber count to each plan card so administrators can see how many barangays are assigned before changing plan availability.

Plan change audit details: Migration `0164_detailed_subscription_plan_activity.sql` records which metadata fields changed without storing the descriptions or entitlement values in the platform activity log. The responsive activity page displays the field names on each plan change.

Subscription deadline preservation: Migration `0165_explicit_subscription_deadline_reset.sql` keeps current subscription dates on routine same-plan/status edits. The editor provides an explicit reset checkbox for administrators who intend to restart trial or grace timing.

Upcoming grace review: Migration `0166_upcoming_subscription_grace_review.sql` adds a seven-day count and paginated filter for past-due subscriptions approaching the end of their grace period. The Super Admin UI provides a shortcut and matching row labels; the queue does not automatically change access or subscription status. Hosted database behavior is not yet verified.

Subscription date audit: Migration `0167_subscription_deadline_audit_details.sql` stores before-and-after subscription start, trial-end, and grace-end timestamps in each subscription event. Super Admin history shows these date changes on desktop and mobile; earlier events are identified as lacking date snapshots. Hosted database behavior is not yet verified.

Incident queue overview shortcuts: Managers can select a status or category count to filter the paginated list and select it again to clear that filter. Shortcuts use the existing server-side queue query and work on mobile and desktop.

Incident unassigned-work shortcut: The manager's active unassigned count now opens the combined unassigned plus needs-attention queue view. Selecting the count again returns to all assignments.

Incident unassigned-work summary: Migration `0149_incident_unassigned_queue_summary.sql` adds a manager-only count of active reports without an assignee to the date-aware queue overview. It is aggregate-only and responsive on desktop and mobile; hosted database behavior has not been verified.

Captain membership access directory: Migration `0190_paginated_barangay_membership_access.sql` adds a tenant-authorized, searchable and status-filtered page of 25 memberships for the Captain's staff access screen. Desktop and mobile views show matching active and suspended counts and preserve the existing role overrides and access audit history. Apply the migration before using the paginated directory in a hosted workspace.

Captain member offboarding: Migration `0192_captain_member_offboarding.sql` adds reason-required, audited revocation for non-Captain memberships. Revocation cancels pending invitations for the member in that barangay and clears custom permission overrides without deleting profiles or operational history; restoring access requires a new invitation. The responsive Staff & access page now searches and filters revoked memberships, shows the administrative reason, and confirms offboarding before it is applied. Apply the migration before using this control in a hosted workspace.

Subscription request activation reliability: Migration `0193_reliable_plan_request_activation.sql` ensures a missing legacy subscription record is initialized before the requested paid plan is applied, then records the request decision in the same transaction. The Super Admin request panel now exposes the specific action error in an expandable details area instead of leaving the cause hidden behind the generic alert. Apply the migration before retrying a pending request in a hosted workspace.

Simplified subscription request activation: Migration `0194_simplify_and_persist_plan_activation.sql` removes the payment-note requirement from Super Admin plan activation, applies the requested subscription, and records the request as activated in the same transaction. If that plan is already active, activation completes the request without duplicating the subscription change. The request leaves the pending queue permanently and remains in activated history. GCash references were removed from plan request guidance.

Captain referral review shortcut: Migration `0197_captain_referral_review_queue_summary.sql` adds a private aggregate count of inbound referrals awaiting acknowledgement or response to the Captain dashboard. The count is included only when the Captain has `referrals.review` permission and opens the existing referral workspace when selected. Apply the migration before using the shortcut in a hosted workspace.

Captain invitation follow-up shortcut: Migration `0198_captain_pending_invitation_summary.sql` adds a count of unexpired invitations awaiting acceptance to the Captain dashboard. The count is visible only when the account has `membership.invite` permission and links to the existing invitation manager; it exposes no invitee details on the overview. Apply the migration before using the shortcut in a hosted workspace.

Complete Captain finance queue count: Migration `0199_complete_captain_finance_review_summary.sql` counts pending budgets, submitted transactions, budget amendments, and transaction adjustments that the signed-in reviewer is allowed to review. Self-submitted records are excluded to match separation-of-duties checks. The Captain dashboard shows one finance item count and links to the existing finance workflow. Apply the migration before using the complete count in a hosted workspace.

Captain meeting resolution queue: Migration `0200_captain_meeting_resolution_review_summary.sql` adds a permission-scoped count of draft resolutions awaiting approval to the Captain overview. The shortcut opens Meetings & attendance; no resolution details are exposed in the aggregate. Apply the migration before using the count in a hosted workspace.

Meeting resolution decision notices: Migration `0201_meeting_resolution_approval_notifications.sql` adds a private in-app notice for the proposer when another authorized meeting manager approves their resolution. Notice access is limited to its proposer and follows the existing meeting-update notification preference. The inbox links to Meetings & attendance; no external email or SMS is sent. Apply after migration 0200.

Independent resolution approval: Migration `0202_independent_meeting_resolution_approval.sql` prevents an author from approving their own draft resolution and adjusts the Captain queue count to include only resolutions another manager can approve. The meeting UI hides the self-approval action and explains the review state. Apply after migration 0201.

Independent meeting minutes review: Migration `0203_independent_meeting_minutes_review.sql` records who prepared each minutes draft and requires another authorized meeting manager to mark it reviewed. The responsive minutes editor now requires a saved draft before review and hides the review action from its author. Apply after migration 0202.

Meeting resolution notice destination: Migration `0204_meeting_resolution_notice_destination.sql` adds an owner-scoped lookup that maps an approved resolution notice to its meeting and current schedule page. Tapping the inbox notice now opens the correct meeting on desktop and mobile. Apply after migration 0203.

Captain schedule review queue accuracy: Migration `0205_captain_independent_schedule_review_counts.sql` excludes health outreach and SK event drafts authored by the signed-in Captain from actionable review totals, matching the server's independent-review rule. The pages now disable both publish and return actions on a user's own schedule and explain that another manager must review it. Apply after migration 0204.

Captain review queue refresh: Captain overview totals are fetched again whenever the Captain returns to the overview, so completed actions across resident, document, finance, schedule, incident, referral, invitation, and meeting workflows do not remain cached as pending.

Independent residency verification: Migration `0206_independent_residency_verification.sql` blocks a staff member from verifying or rejecting a resident record they created and excludes those records from their actionable dashboard total. The resident directory checks record authorship before showing review controls and explains when another authorized reviewer is required. Apply the migration before using this safeguard in a hosted workspace.

Independent document request processing: Migration `0207_independent_document_request_processing.sql` blocks an account from processing or revoking its own resident document request. Requesters can still withdraw pending requests or resubmit rejected ones; the Captain overview excludes self-owned requests from actionable totals. Request cards hide staff actions and explain the independent-review requirement on desktop and mobile. Apply this migration after `0206` before using the safeguard in a hosted workspace.

Secretary work queue: Migration `0208_secretary_actionable_review_queue.sql` adds private counts for residency checks, profile corrections, document requests, resolution approvals, and meeting minutes awaiting independent review. The responsive Secretary overview links each count to the corresponding existing workspace, and the server excludes self-owned records from actionable totals. Apply the migration after `0207` before using the queue in a hosted workspace.

Treasurer submission follow-up: Migration `0209_treasurer_submission_follow_up.sql` adds private counts of the Treasurer's own budgets, transactions, and change requests awaiting Captain review. The mobile and desktop overview links these counts to Finance and no longer labels the Treasurer's own submissions as items they need to review. Apply the migration after `0208` before using the summary in a hosted workspace.

Kagawad action item overview: Migration `0210_kagawad_action_item_summary.sql` adds a role-checked, private summary of the signed-in Kagawad's assigned committee tasks, with open, in-progress, blocked, and overdue counts. The responsive overview links those counts to Committees. Apply after `0209` before using the migration in a hosted workspace.

Kagawad meeting participation: Migration `0211_kagawad_meeting_participation_summary.sql` adds private counts for the Kagawad's upcoming meeting invitations and meetings currently open for self check-in. The responsive overview links both counts to Meetings. Apply after `0210` before using the feature in a hosted workspace.

Kagawad project contribution history: Migration `0212_kagawad_project_contribution_history.sql` adds a role-checked, paginated view of a Kagawad's own progress reports and milestones. The responsive Projects page presents the history with project status and submission time. Apply after `0211` before using the hosted workspace.

Kagawad assigned action queue: Migration `0213_kagawad_assigned_action_item_queue.sql` adds a private, searchable queue spanning the Kagawad's active committees. The responsive Committees page provides status filters, task updates, and pagination. Apply after `0212` before using the hosted workspace.

Kagawad due-date filters: Migration `0214_kagawad_action_item_due_filters.sql` adds server-side filters for assigned work due within seven days and unfinished overdue work. The responsive Committees queue retains search, status selection, task updates, and pagination. Apply after `0213` before using the hosted workspace.

Kagawad meeting invitations: Migration `0215_kagawad_invited_meeting_queue.sql` adds a private paginated queue of the signed-in Kagawad's upcoming invited meetings, including attendance state and check-in availability. The Meetings page shows the responsive list, provides check-in only for invited Kagawads during the allowed window, and refreshes the queue after attendance is recorded. Apply after `0214` before using the hosted workspace.

Kagawad task progress notes: Migration `0216_kagawad_action_item_progress_notes.sql` adds append-only notes on tasks assigned to the signed-in Kagawad. The responsive Committees queue allows the assignee to explain progress or blockers and view their note history; the database rejects notes for other members' tasks. Apply after `0215` before using the hosted workspace.

Committee manager note review: Migration `0217_committee_manager_progress_note_visibility.sql` permits a committee manager to read notes on tasks in active committees they manage. Committee task cards show a responsive progress-note history to managers; only the assigned Kagawad can add notes. Apply after `0216` before using the hosted workspace.

Committee manager task responses: Migration `0218_committee_task_progress_note_responses.sql` lets authorized committee managers append guidance or follow-up to the task progress history. The manager history panel includes the response form, and the database limits manager responses to tasks in active committees they manage. Apply after `0217` before using the hosted workspace.

Kagawad task-response alerts: Migration `0219_notify_kagawad_of_manager_task_response.sql` places an in-app alert in the assigned Kagawad's Community updates inbox when a committee manager responds. Repeated replies refresh the task's existing alert; read access follows the task's current assignee. Opening the alert leads to Committees. Apply after `0218` before using the hosted workspace.

Kagawad progress alerts: Migration `0220_notify_committee_managers_of_kagawad_progress.sql` adds an in-app Community updates alert for active committee managers when an assigned Kagawad posts progress. Alerts refresh per task, and inbox access is restricted to the assignee and managers. Apply after `0219` before using the hosted workspace.

Committee task notification deep links: Migration `0221_committee_task_notification_context.sql` adds a minimal, role-scoped task context lookup. Opening either side's task alert now displays the task and its chronological progress and response thread, with the appropriate note composer on mobile and desktop. Apply after `0220` before using this hosted workflow.

Kagawad task status history: Migration `0222_kagawad_task_status_history.sql` adds an indexed, paginated view of status changes for tasks assigned to the signed-in Kagawad. A responsive history panel sits beside each task's progress notes and includes changes made by authorized committee managers. Apply after `0221` before using this hosted workflow.

Kagawad blocker reporting: Migration `0223_kagawad_blocker_reports.sql` lets an assigned Kagawad mark work blocked with a required reason. The database atomically changes status, appends the reason to the task progress thread, and sends the existing manager notification; the reason form adapts to desktop and mobile. Apply after `0222` before using this hosted workflow.

Kagawad completion summaries: Migration `0224_kagawad_task_completion_summaries.sql` asks the assigned Kagawad for a short completion summary. Status, history event, and note are recorded atomically, and committee managers are notified through the existing task progress alert. The responsive task form guides the member through completion. Apply after `0223` before using this hosted workflow.

Kagawad due-date requests: Migration `0225_committee_task_due_date_requests.sql` allows assigned Kagawads to propose a future task due date with a reason. Committee managers receive an in-app alert and can approve or decline from a paginated review queue; declines require an explanation. The Kagawad task card shows the latest decision, and desktop and mobile use the same responsive workflow. Apply after `0224` before using this hosted workflow.

Kagawad due-date request history: Migration `0226_kagawad_due_date_request_history.sql` exposes a paginated history of the signed-in Kagawad's own proposals and decisions for an assigned task. The task panel supports multiple reviewed requests and keeps the next-request form available only when no request is awaiting review. Apply after `0225` before using this hosted workflow.

Kagawad meeting history: Migration `0227_kagawad_meeting_attendance_history.sql` adds a private, paginated record of past meetings the signed-in Kagawad was invited to, showing only their own attendance status and recording time. The Meetings page includes a responsive history panel alongside upcoming invitations. Apply after `0226` before using this hosted workflow.

Kagawad attendance corrections: Migration `0228_kagawad_attendance_correction_requests.sql` adds a reviewable workflow for attendance corrections on past meetings. Kagawads submit a reason and requested status; officials with attendance management access approve or decline, with approved changes written to the attendance audit log. Request history and reviewer controls are available in the responsive Meetings page. Apply after `0227` before using this hosted workflow.

Attendance correction notifications: Migration `0229_attendance_correction_notifications.sql` alerts attendance managers about new Kagawad requests and sends the requester a Community updates notice after approval or decline. Access and read status follow the requester or active attendance-management permission. Apply after `0228` before using these notices.

Kagawad meeting RSVP: Migration `0230_kagawad_meeting_availability_responses.sql` lets invited Kagawads indicate whether they plan to attend or are unavailable before a scheduled meeting. The meeting workspace shows aggregate totals to authorized meeting and attendance managers, keeping RSVP separate from actual attendance. Apply after `0229` before using this workflow.

Kagawad RSVP history: Migration `0231_kagawad_meeting_rsvp_history.sql` stores each distinct RSVP change and adds a private, paginated history for the responding Kagawad. The Meetings page labels these as availability responses rather than attendance. Apply after `0230` before using this history.

Kagawad task assignment history: Migration `0232_kagawad_task_assignment_history.sql` records action-item assignment events and backfills current assignments. The Committees page presents a private paginated history with task status, due date, and assignment timestamp, including transferred assignments and archived committees. Apply after `0231` before using this history.

Kagawad assignment alerts: Migration `0233_kagawad_task_assignment_notifications.sql` sends an in-app notice to the active assignee when a committee task is assigned. The notice links to the task conversation and is readable only by its current assignee. Apply after `0232` before using assignment alerts.

Kagawad contribution search: Migration `0234_searchable_kagawad_project_contributions.sql` adds a private, paginated search for the signed-in Kagawad's own project updates. The Projects page filters by text, update type, and inclusive dates with responsive desktop and mobile controls. Apply after `0233` before using the filters.
