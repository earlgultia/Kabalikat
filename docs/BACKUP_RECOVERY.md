# Backup and recovery runbook

This runbook describes an operator procedure; KABALIKAT does not create, monitor, or restore backups automatically. Assign named primary and alternate operators, approve recovery objectives, and rehearse this procedure in a separate non-production project before a real incident.

## Plan the protection

- Confirm the Supabase plan and the project's **Database → Backups** page. Current Supabase documentation says Pro, Team, and Enterprise projects receive daily backups with plan-dependent retention; verify the retention shown for this specific project instead of assuming a schedule.
- Decide and document the recovery point objective (maximum acceptable data loss) and recovery time objective (maximum acceptable downtime) with the barangay and platform owners. If daily recovery points do not meet the approved objective, evaluate Supabase Point-in-Time Recovery and its cost before enabling it.
- Keep a separate, encrypted, access-controlled copy of migration files and reviewed deployment configuration. Never store database passwords, service-role keys, auth tokens, or personal data exports in Git.
- Database backups do not restore Storage objects. Inventory private buckets and plan a separately protected copy and restoration process for object files. Test metadata-to-object consistency after recovery.
- Set an approved retention period for any off-site copies, restrict access to named operators, record access, and securely remove expired copies according to the approved records policy.

## Prepare before an incident

1. Record the production project reference, region, database version, enabled Auth providers, redirect URLs, Storage buckets and policies, custom database roles, scheduled jobs, extensions, and deployed application version in the restricted operations inventory.
2. Keep a non-production Supabase project available for restoration exercises. Do not rehearse by overwriting production.
3. At an agreed interval, restore a recent backup into that isolated project. Confirm the app's migrations, RLS, auth flows, subscription and tenant boundaries, Storage object access, and representative workflows. Record the backup timestamp, duration, checks, defects, and operator.
4. Do not use real resident, health, youth, or financial data in rehearsal unless the responsible data owner has approved the environment and safeguards.

## Respond and restore

1. Open an incident record. Record discovery time, suspected impact, affected project, last known good time, and the operator. Follow the organization's privacy and breach response process if personal data may be affected.
2. Limit writes only under the approved incident procedure. Preserve relevant logs and evidence; do not delete or modify the source project during diagnosis.
3. Choose the latest suitable recovery point before the incident. Prefer restoring into a new or isolated project first when practical, so the source remains available for investigation and comparison.
4. An authorized Supabase project owner performs the restore from the Dashboard's **Database → Backups** or **Point in Time** controls. A restore makes the target project inaccessible during the operation; schedule and communicate the expected downtime. Confirm the target project carefully before approving the irreversible recovery action.
5. Restore separately protected Storage objects and any external configuration not included in the database backup. Check custom database role passwords and external integrations; backups may not include those credentials or objects.
6. Validate database migration history, required extensions, RLS and grants, tenant isolation, sign-in and redirects, Storage policies and objects, and the highest-priority resident and staff workflows. Use synthetic accounts and records. Compare important record counts and timestamps against incident logs where possible.
7. Do not switch production traffic or announce recovery until the technical owner and data owner accept the validation results. If validation fails, keep the restored project isolated and escalate to the Supabase project owner.
8. Record the restore point, data-loss estimate, downtime, validation evidence, approvals, user communications, and follow-up actions. Review whether the selected recovery objectives and backup retention remain adequate.

## Recovery exercise record

Copy and complete this record after each rehearsal or real recovery:

| Field | Record |
| --- | --- |
| Exercise or incident date and operator | |
| Source and isolated target project references | |
| Selected backup/recovery timestamp | |
| Database restore start/end and downtime | |
| Storage restoration and object checks | |
| Auth, migration, RLS, and tenant-isolation checks | |
| Representative workflow checks | |
| Data loss estimate and unresolved defects | |
| Reviewer and approval to resume service | |

## Supabase reference

Supabase documents plan-specific daily backups, Point-in-Time Recovery, restoration downtime, and the fact that database backups do not include Storage API objects in its [Database Backups guide](https://supabase.com/docs/guides/platform/backups). Review that guide and the current project Dashboard before each exercise because provider features and retention can change.

This runbook is not evidence that backups are enabled, that an export exists, or that restoration has been tested. Keep those readiness claims marked incomplete until a successful rehearsal is documented.
