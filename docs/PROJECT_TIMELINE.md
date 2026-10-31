# KABALIKAT Project Timeline and Status

**Status checked:** 31 October 2026
**Estimated implementation completion:** **74%**
**Current position:** Phase 7 hardening, with remaining Phase 5 and Phase 6 product work.

## How to read the percentage

The 74% figure is a rough estimate of the seven roadmap phases in the project specification, giving each phase equal weight. It measures implemented scope, not elapsed time, production readiness, or verified security. A phase is not considered fully done just because its interface exists. Database migration and authorization verification are still outstanding for this workspace.

| Phase | Scope | Estimate | Current state |
| --- | --- | ---: | --- |
| 1. Foundation | Authentication, tenant roles and permissions, database foundation | 85% | Core implemented; full migration and RLS verification is pending. |
| 2. Core barangay operations | Onboarding, residents, announcements, documents, meetings and attendance | 92% | Announcement audience targeting, notification preferences, resident feedback and staff follow-up, request withdrawal/history, and staff-reviewed resident profile correction requests are implemented; live database and policy checks are pending. |
| 3. Archives and productivity | Archive, meeting records, QR attendance, reports and OCR | 85% | Archive and productivity tools implemented; no OCR provider is configured. |
| 4. Finance and projects | Budgets, approvals, receipts, committees and project tracking | 90% | Finance and project workflows implemented; database verification is pending. |
| 5. Specialized workspaces | SK, health, safety, incident workflows and referrals | 83% | SK proposals, independently reviewed events and public accomplishment summaries with activity history, a unified calendar with downloadable upcoming published SK and health outreach schedules, searchable status-filtered BHW and SK event queues, searchable Tanod patrol shifts, incidents with verified handoff logging, advisories, published emergency contacts and evacuation centers with audit history, controlled referrals, and restricted incident evidence implemented. Clinical workflows and restricted youth registry/programs remain. |
| 6. Subscriptions and integrations | Plans, billing, notifications, OCR/AI providers and support | 55% | Support portal now has searchable, status-filtered, paginated triage with conversations loaded on demand; subscription metadata includes review indicators and filtered CSV export. Payments, enforced entitlements, email/SMS, and provider integrations remain. |
| 7. Hardening and pilot | Security verification, accessibility, performance, backups, pilot and training | 30% | SPA deployment routing and browser security headers are configured; GitHub Actions is configured for lint, TypeScript checks, Vitest, production builds, isolated migration application, and pgTAP checks. Keyboard skip links, reduced-motion preferences, keyboard-accessible mobile navigation, and consistent dialog focus handling are supported. Full accessibility and cross-tenant review, successful CI database verification, recovery, pilot and operational reviews remain. |

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
- Resident and household records, resident correction requests and owner-only personal-data export, private feedback with staff replies, announcements, document services, meetings, attendance and private archive.
- Finance approvals, receipts, committee tasks, SK project proposals with activity history and independently reviewed public accomplishment summaries, general barangay project tracking, incidents, patrol shifts, disaster advisories, and audited emergency contact/evacuation center listings.
- Platform support portal with searchable paginated triage and on-demand conversation/history loading, admin-managed plan/subscription records with review indicators and CSV exports, controlled audited inter-barangay referrals, BHW outreach scheduling, SK event scheduling with Captain review, and a read-only calendar for upcoming published community events.
- Vercel SPA deep-link rewrite and browser security headers.
- Installable PWA app shell with a clear offline notice, reconnect prompt, and user-controlled updates; secure records and mutations still require a live connection and are not queued for later sync.
- Community update notifications link to the matching paginated announcement, advisory, document request, feedback item, or profile correction request when the signed-in role can access it.
- GitHub Actions CI for locked dependency installation, lint, TypeScript checks, Vitest, and production builds on pushes and pull requests.
- An isolated Supabase CI job that applies all migrations and runs the existing pgTAP suites without hosted-project credentials; its first GitHub run is still pending.

## Main remaining work

1. **Verify the database:** The isolated CI workflow applies migrations 0001-0107 and runs pgTAP suites, including role-targeted announcement, resident profile correction, private feedback, public document verification, platform subscription controls, and owner-scoped personal export coverage. Add resident directory, document queue, finance paging, archive search and folder paging, meeting resolution/member search, community calendar, platform directory/subscription paging, support queue/thread, committee member-picker, referral paging, Tanod picker, meeting attendee-directory, document type history, SK accomplishment paging, project-history, finance budget paging, feedback activity paging, complete personal export, health outreach search, SK event search, patrol shift search, searchable meeting schedule, and meeting status history coverage to pgTAP and review the first GitHub run. Its status has not been verified in GitHub yet.
2. **Complete agreed specialist modules:** Clinical BHW workflows and restricted youth registry/program workflows require explicit data minimization and access rules. Current BHW and SK event features only schedule public community events.
3. **Decide integration behavior:** Billing, plan enforcement, email/SMS, OCR and AI require product decisions, real providers, server-side secrets, and user-facing failure handling.
4. **Complete hardening:** Cross-tenant/RLS review, accessibility and performance checks, backup restore, operational monitoring, and incident response procedures.
5. **Prepare and run a pilot:** Confirm privacy/legal notices and retention policy, deployment and support ownership, user training, and pilot acceptance criteria. Rehearse and record backup restoration using the [recovery runbook](BACKUP_RECOVERY.md).

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
