# KABALIKAT

KABALIKAT is a multi-barangay management platform by ArkByte Technologies. This repository contains the Phase 1 security foundation, core barangay operations, specialized workspaces, subscriptions metadata, project tracking, and controlled inter-barangay referrals.

## Quick start

1. Install Node.js 20.19+ or 22.12+ and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set the Supabase project URL and public anon/publishable key.
4. Apply migrations `0001_foundation.sql` through `0091_paginated_committee_member_picker.sql` in order to a **development** Supabase project using the Supabase CLI or SQL editor.
5. Run `npm run dev`.

Available commands: `npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

## Environment

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are read by the browser. The anon key is public by design; database security must come from RLS. Never put a service-role key in a `VITE_` variable or commit secrets.

## Account bootstrap

General public signup is not included. A user can create an account from an invitation link, but gains no tenant access until the server accepts a valid, unexpired invitation for that account's email. Provision a platform administrator out of band; that administrator can create a barangay and a seven-day, one-time Captain invitation in the platform workspace. Captains can invite officials the same way. Supabase Auth handles account confirmation if enabled in project settings; the app does not send invitation email/SMS. Keep credentials out of SQL migrations and source control. Do not use real resident information during development.

For the secure first platform administrator bootstrap steps, see [Provision the first platform administrator](docs/SETUP.md#provision-the-first-platform-administrator).

Phase 2 includes resident and household records, residency verification, announcements, document request processing, meetings, attendance, and private resident feedback with staff follow-up, with role-gated overview metrics. Phase 3 includes a private searchable archive for PDF and image files, reviewed meeting minutes, approval-tracked resolutions, browser print-to-PDF meeting reports, and short-lived QR attendance. Phase 4 includes annual budgets with approved amendments, independently reviewed financial entries and linked adjustments, audited voiding of posted entries, private receipt attachments, and audited date-range CSV reports. Phase 5 committee workspaces support member assignment and tracked action items; SK supports reviewed project proposals and event schedules without youth registration or participant tracking; incident reporting supports resident submissions visible only to their creator and barangay Captains, plus Tanod submissions, assignment to active Tanods, assignee acknowledgment, response updates, verified external handoff logging, controlled status transitions, restricted private evidence, and audit history. Patrol shifts support Captain scheduling, Tanod assignment, shift start/completion, and manual checkpoint logs without live location tracking. Disaster advisories support official drafts, publication, expiry labels, resolution notes, and published guidance; the disaster workspace also provides staff-managed emergency contacts and evacuation centers published to active barangay members. BHWs can submit community outreach schedules for Captain review; published schedules are readable by active members, with no patient or participant registry. The unified read-only community calendar combines upcoming published SK and health outreach schedules without exposing drafts, attendance, or participant records, and supports downloading the visible schedule as an .ics calendar file. The platform overview includes a metadata-only barangay directory. OCR provider integration, youth registries and programs, and clinical health workflows remain future work.

Phase 6 also includes an internal support portal with requester-owned tickets, public replies, administrator-only notes, and audited status changes. The platform console has a plan catalog and admin-managed trial/status records; there is no payment processing, and entitlements do not gate access yet.

Phase 7 adds general barangay project tracking, separate from SK proposals and the finance ledger. Active barangay members can view projects; Captains, Secretaries, and Kagawads can create projects, change their status through controlled transitions, and add progress or milestone updates.

Phase 7 also includes controlled inter-barangay referrals and restricted incident evidence. Referrals use an explicit disclosure basis, limited information, and audited access; incident evidence is stored privately and visible only to the Captain or Tanod assigned to the incident. The responsible barangays must establish and review their disclosure policy before using referrals with real information.

See the [project timeline and status](docs/PROJECT_TIMELINE.md), [setup guide](docs/SETUP.md), [security notes](docs/SECURITY.md), [backup and recovery runbook](docs/BACKUP_RECOVERY.md), and [architecture](docs/ARCHITECTURE.md).
