# KABALIKAT Project Timeline and Status

**Status checked:** 29 October 2026  
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
| 5. Specialized workspaces | SK, health, safety, incident workflows and referrals | 80% | SK proposals, independently reviewed events and public accomplishment summaries with activity history, a unified calendar with downloadable upcoming published SK and health outreach schedules, Tanod operations, incidents with verified handoff logging, advisories, published emergency contacts and evacuation centers with audit history, controlled referrals, restricted incident evidence, and BHW outreach scheduling implemented. Clinical workflows and restricted youth registry/programs remain. |
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
- Installable PWA app shell with a clear offline notice and user-controlled updates; secure records and mutations still require a live connection and are not queued for later sync.
- GitHub Actions CI for locked dependency installation, lint, TypeScript checks, Vitest, and production builds on pushes and pull requests.
- An isolated Supabase CI job that applies all migrations and runs the existing pgTAP suites without hosted-project credentials; its first GitHub run is still pending.

## Main remaining work

1. **Verify the database:** The isolated CI workflow applies migrations 0001-0070 and runs pgTAP suites, including role-targeted announcement, resident profile correction, private feedback, public document verification, platform subscription controls, and owner-scoped personal export coverage. Add resident directory and document queue paging/filter coverage to pgTAP and review the first GitHub run. Its status has not been verified in GitHub yet.
2. **Complete agreed specialist modules:** Clinical BHW workflows and restricted youth registry/program workflows require explicit data minimization and access rules. Current BHW and SK event features only schedule public community events.
3. **Decide integration behavior:** Billing, plan enforcement, email/SMS, OCR and AI require product decisions, real providers, server-side secrets, and user-facing failure handling.
4. **Complete hardening:** Cross-tenant/RLS review, accessibility and performance checks, backup restore, operational monitoring, and incident response procedures.
5. **Prepare and run a pilot:** Confirm privacy/legal notices and retention policy, deployment and support ownership, user training, and pilot acceptance criteria. Rehearse and record backup restoration using the [recovery runbook](BACKUP_RECOVERY.md).

The system is **not production-ready** until the database checks, deployment controls, privacy review and pilot gates are complete. Passing frontend build or lint checks alone does not establish database security.

## Updating this status

Update phase estimates and milestone states when a feature is implemented and its stated verification gate has evidence. Recalculate the overall estimate as the unweighted average of the seven phase estimates above, rounding to the nearest whole percent. Keep the estimate labeled as approximate until the specification is decomposed into a verified task inventory.
