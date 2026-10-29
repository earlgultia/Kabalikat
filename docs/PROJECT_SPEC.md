Below is a comprehensive project specification and master prompt for KABALIKAT by ArkByte Technologies that you can give to Codex in VS Code. It is designed to guide Codex through building a real, production-minded Barangay Management System using React, TypeScript, and Supabase.

The most important principle is to build KABALIKAT as a secure, multi-barangay platform, not simply a dashboard with different user roles. Each barangay must have its own private records, permissions, workflows, and subscription, while the platform administrator manages the overall service.

The project should be built in phases so Codex can implement, test, and verify each part instead of generating a large amount of incomplete code in one attempt.
1. Project overview









KABALIKAT
By ArkByte Technologies

One Barangay. One Connected Community.

A centralized digital platform for barangay administration, public services, records, financial accountability, community safety, and youth governance.



Multi-tenant

Multiple barangays with strictly isolated data.


Role-based access

Each official accesses only authorized features.


Digital records

Documents, meetings, archives, and transactions.


Resident services

Online requests, announcements, and incident reports.




Technology stack
Component	Recommended technology
Frontend	React, TypeScript, Vite
UI	Tailwind CSS, shadcn/ui, Lucide icons
Routing	React Router
Backend	Supabase
Database	PostgreSQL
Authentication	Supabase Auth
Authorization	PostgreSQL Row Level Security (RLS)
File storage	Private Supabase Storage buckets
Forms and validation	React Hook Form and Zod
Data fetching	TanStack Query
Charts	Recharts
QR codes	QR generation and scanning libraries
OCR	Pluggable OCR service, with a mock or local-development adapter
Testing	Vitest, React Testing Library, Playwright
Deployment	Static frontend hosting plus Supabase

The stack is intentionally modular. OCR, AI summarization, SMS, email, payments, and other external services should be added through server-side integrations, not exposed secret keys in the browser.
2. All user roles and what they can do









1. Super Administrator
- Register and configure barangays.
- Create the initial Barangay Captain account.
- Set subscription plans, trials, grace periods, and status.
- Monitor platform availability, usage, and system errors.
- Manage support requests and platform configuration.
- Suspend or reactivate subscriptions according to policy.
- View platform-level metadata and audit events without unrestricted access to private resident, health, or financial records.












2. Barangay Captain
- Manage authorized officials and staff accounts.
- Assign roles and fine-grained permissions.
- Review pending requests and approvals.
- Oversee barangay operations, projects, incidents, and announcements.
- View permitted reports and audit history.
- Manage office settings and official signatures.
- Create or authorize the SK Chairman account.
- Cannot bypass legal, privacy, or financial controls simply because of their role.












3. Barangay Secretary
- Register residents and households.
- Verify residency using approved procedures.
- Process residency certificates, clearances, indigency certificates, and other configured documents.
- Track requests, payments where applicable, approvals, issuance, and release.
- Publish announcements to residents, officials, or both.
- Schedule meetings and maintain agendas, minutes, attendance, and resolutions.
- Scan documents, extract searchable text, and organize digital archives.
- Refer incidents to another barangay only through authorized, auditable workflows.












4. Barangay Treasurer
- Record income, expenses, budgets, receipts, vouchers, and supporting documents.
- Categorize transactions and link them to projects or programs.
- Track budget allocations and utilization.
- Prepare financial reports and reconciliation summaries.
- Scan and attach receipts.
- Submit records for required review or approval.
- Maintain immutable audit history for posted financial transactions.
- Prevent unauthorized editing or deletion of finalized records.












5. Barangay Kagawad
- Access assigned committees and permitted dashboards.
- Manage committee activities and action items.
- Record projects, beneficiaries, milestones, expenses linked to projects, and progress reports.
- Upload before-and-after photographs and supporting documents.
- Submit recommendations and requests for approval.
- View only the residents or sensitive records necessary for an authorized task.












6. SK Chairman and SK Council
- Operate a dedicated youth governance workspace.
- Manage authorized SK council member accounts and roles.
- Maintain a restricted youth registry with age and eligibility safeguards.
- Organize youth programs, sports events, consultations, and community activities.
- Register participants and record QR attendance.
- Manage proposed projects, budgets, expenditures, and supporting receipts.
- Create meetings, minutes, resolutions, and accomplishment reports.
- Receive youth concerns and publish announcements.
- Produce transparency reports with appropriate public disclosure.
- Keep SK information separate from unrelated barangay health and confidential resident records.












7. Barangay Health Worker (BHW)
- Access authorized health-related resident records.
- Record home visits, health education, maternal and child health follow-ups, immunization tracking, screening, and referrals as appropriate to their duties.
- Schedule outreach programs and health campaigns.
- Maintain confidential notes with access controls.
- Produce aggregate statistics that avoid exposing individual patient information.
- Never access financial, SK, or unrelated confidential records by default.












8. Barangay Tanod
- Submit incident, hazard, patrol, and safety reports.
- Record shift schedules and patrol logs.
- Track incident status, assigned responders, and timestamps.
- Attach authorized evidence files with restricted access.
- Escalate serious incidents to designated officials or emergency services.
- Record acknowledgment and resolution status.
- Avoid unnecessary access to health, financial, and resident identity records.












9. Resident
- Register or access an account using the configured verification process.
- Submit document requests and track their status.
- View official public announcements.
- Report hazards, accidents, and community concerns.
- View emergency contacts and published evacuation information.
- Register for eligible community programs.
- Submit feedback or follow up on reports.
- Access only their own private requests and authorized personal records.



Important: Roles should be configurable, but sensitive permissions must have safe defaults. A user should not gain access to a module merely because a frontend menu is visible.
3. Main modules and workflows
A. Super Admin portal
The platform owner needs a separate administration portal, not an ordinary barangay dashboard.

Required pages:
- Overview dashboard with registered barangays, active subscriptions, trials, expired subscriptions, and system health.
- Barangay directory with search, status, municipality, province, and registration date.
- Barangay registration wizard.
- Initial Captain account creation and secure invitation flow.
- Subscription plans and billing history.
- Trial activation, expiration, grace-period rules, and suspension/reactivation.
- Support tickets and platform announcements.
- System activity logs, security alerts, and integration status.
- Platform configuration and feature flags.
A Super Admin must not be able to access every private record simply because they administer the software. If support access is needed, implement a documented, time-limited, approved, and audited procedure.
B. Barangay registration and onboarding
1. The Super Admin creates a barangay profile.
2. The platform validates the barangay's unique identifier and location information.
3. The Super Admin creates an initial Captain invitation.
4. The Captain accepts the invitation and sets up authentication.
5. The Captain completes the barangay profile and office configuration.
6. The Captain invites authorized officials.
7. The barangay selects or receives an applicable subscription plan.
8. The system logs account creation, role assignments, and plan changes.
Do not allow public signup to create a Super Admin account or an unverified barangay tenant.
C. Secretary and document services
The document workflow should support:
- Configurable document types and requirements.
- Resident search with appropriate privacy limits.
- Application submission and reference number generation.
- Pending, under review, awaiting approval, approved, rejected, issued, released, and cancelled statuses.
- Reason for rejection and resubmission.
- Optional fees, official receipts, and payment reconciliation if applicable.
- Authorized signatures and document templates.
- PDF generation and print-friendly layouts.
- Issuance number, issue date, expiration date when applicable, and verification status.
- Revocation or correction workflows that preserve history.
- Document request notifications.
- Searchable archive with filters and permission checks.
Never automatically issue an official certificate solely because a form was submitted. Required verification and approval must be completed first.
D. Meetings and QR attendance
A meeting should have its own ID, date, location, agenda, authorized attendees, and attendance policy.

Attendance workflow:
1. An authorized official creates a meeting.
2. The system creates a meeting-specific QR code or short-lived attendance token.
3. The attendee scans the code and is authenticated or otherwise verified.
4. The server checks the meeting, attendee eligibility, time window, and token validity.
5. Duplicate submissions are rejected.
6. Attendance is recorded with a timestamp and an auditable source.
7. Authorized officials review attendance and correct mistakes through an audited correction process.
8. The system generates an attendance sheet and meeting report.
A QR code is not proof of identity by itself. Do not embed a resident's address, birth date, health details, or other sensitive personal data in a QR code. Any penalties or disciplinary consequences must be subject to applicable rules and due process.
E. SmartScan AI
Build document scanning as a modular feature:
- Camera upload and file upload.
- Crop, rotate, deskew, and image enhancement.
- OCR extraction.
- Original file preservation.
- Searchable extracted text.
- Draft summaries, meeting minutes, action items, and key dates.
- Manual correction of OCR results.
- Document classification suggestions.
- Export to PDF or another approved format.
- Review and approval before any generated content becomes an official record.
OCR and AI can make mistakes. Clearly label generated results as drafts, track the reviewer, and never silently overwrite the original scan.
F. Treasurer and financial accountability
Support:
- Annual and program-specific budgets.
- Income and expense entries.
- Categories, funding sources, project links, and transaction dates.
- Receipt, voucher, and supporting-document attachments.
- Draft, submitted, reviewed, approved, posted, and voided states.
- Approval limits and separation of duties.
- Budget utilization and financial summaries.
- Monthly, quarterly, and annual reports.
- Exportable records.
- Audit logs for edits, approvals, reversals, and exports.
Finalized transactions must not be silently deleted or rewritten. Corrections should use authorized reversal or adjustment entries with reasons and references to the original transaction. Configure financial workflows according to applicable accounting rules and local government requirements.
G. Kagawad committee workspaces
Allow the Captain or authorized administrator to configure committees such as:
- Peace and order.
- Infrastructure and public works.
- Health and sanitation.
- Education.
- Agriculture.
- Environment and waste management.
- Disaster preparedness.
- Livelihood and social services.
- Youth and sports.
- Other locally defined committees.
Each committee can have its own dashboard, assigned members, action items, projects, documents, deadlines, progress reports, and approvals. Committee access must not automatically grant access to all resident or health data.
H. SK governance workspace
Build the SK workspace as a distinct area within the barangay tenant, with its own permissions and workflows.

Include:
- SK Chairman account and authorized council member invitations.
- Youth registry with limited access, verification status, and data minimization.
- Youth needs assessment and consultation.
- Programs, events, registration, eligibility, and attendance.
- Project proposals, milestones, budgets, and expenditure records.
- Meeting agendas, minutes, and resolutions.
- Youth concern and feedback submissions.
- Accomplishment reports and public transparency summaries.
- Controlled publishing of announcements.
- Audit trail for sensitive changes.
Do not assume that every young person is eligible for every SK activity or that all youth records should be public. Collect only necessary information and implement appropriate safeguards for minors.
I. BHW health services
The health workspace should support authorized tasks such as:
- Resident health profiles where lawful and necessary.
- Health visits and follow-ups.
- Maternal and child health tracking.
- Immunization and screening records.
- Referrals and outreach schedules.
- Health campaign participation.
- Restricted clinical notes and attachments.
- Aggregate reporting and trends.
Health data is sensitive personal information. Restrict access by duty and purpose, audit access to sensitive records, and establish retention and disclosure policies with the appropriate local health authorities. Do not include individual medical information in public dashboards or ordinary notification messages.
J. Tanod, incident, and disaster management
Include:
- Incident reporting form.
- Category, location, date, severity, and description.
- Reporter identity or anonymous reporting where policy permits.
- Assignment to an authorized responder.
- Acknowledgment and response timestamps.
- Status tracking and escalation.
- Restricted evidence attachments.
- Patrol schedules and shift logs.
- Disaster alerts and evacuation advisories.
- Evacuation center details and published emergency contacts.
- Resolution notes and incident reports.
The system must make clear that submitting an online report is not the same as contacting emergency services. For urgent emergencies, provide configured official emergency contact instructions and avoid promising instant response unless a real monitored response workflow exists.
K. Inter-Barangay Connect
This is a valuable feature but one of the most security-sensitive.

Example workflow: an incident involves a resident who belongs to a different barangay.
1. An authorized official records the incident in the originating barangay.
2. The official requests a referral to the appropriate home barangay.
3. The server validates the user's permission and the referral's purpose.
4. The system shares only the minimum information necessary for that referral.
5. The receiving barangay accepts or rejects the referral.
6. An authorized recipient reviews the information and records a response.
7. Any permitted family notification follows a defined policy and legal basis.
8. Both sides retain an audit trail of the referral and subsequent access.
No barangay should be able to search another barangay's entire resident database. Do not implement a global resident search that bypasses consent, legal authority, or role restrictions. Define clear retention, correction, and disclosure rules.
L. Resident portal
The resident experience should work well on mobile phones.

Include:
- Account setup and identity or residency verification where required.
- Personal profile and household association where appropriate.
- Online document applications.
- Request tracking and notifications.
- Public announcements.
- Community program registration.
- Incident and hazard reporting.
- Feedback and service inquiries.
- Emergency contacts and published disaster advisories.
- Downloadable or printable authorized documents.
- Accessible, clear status explanations.
Residents should not see internal staff notes, other residents' applications, confidential evidence, health records, or financial details unless a specific lawful and authorized workflow permits access.
M. Digital archive and BarangayVault
- Folder and subfolder organization.
- Configurable document categories.
- Tags and metadata.
- OCR-based search.
- Document versions and revision history.
- Retention and archival policies.
- Permission-aware downloads.
- Private file storage and expiring signed links.
- Backup and restoration procedures.
- Export and legal hold workflows when applicable.
A folder name or a hidden frontend route is not a security boundary. Every read, write, search, download, and deletion operation must be authorized on the server or enforced through database/storage policies.
N. Announcements and notifications
Allow authorized users to publish announcements to:
- All residents.
- Barangay officials.
- Specific authorized roles or groups.
- SK participants.
- A defined program or event audience.
Support in-app notifications and optional email/SMS providers. Record delivery status where available, respect notification preferences, and avoid including sensitive details in notification previews.
O. Subscription and monetization system
Start with configurable plans rather than hardcoding prices.
Plan	Possible features
Free	Basic barangay profile, limited users, essential announcements and requests
Pro	Expanded records, meetings, finance, archive, QR attendance, and reporting
Enterprise / LGU	Multi-barangay administration, advanced reports, integrations, and support

Plan limits, prices, feature entitlements, and billing intervals must be configurable by authorized platform administrators.

Enforce subscription status on protected server-side operations. When a subscription expires, preserve official records and provide appropriate read-only access, export, renewal, and recovery procedures. Do not delete government records because of nonpayment. Emergency and legally required functions should follow a separately defined continuity policy.
4. Database architecture
Use PostgreSQL through Supabase. The schema should be normalized, migration-managed, and designed for tenant isolation from the beginning.

Every table containing barangay-owned data should have a barangay_id directly or through a carefully enforced parent relationship. Do not rely on the frontend to determine which tenant a user can access.
Core database groups

Identity and access
profiles, barangays, barangay_memberships, role_definitions, permissions, role_permissions, membership_permissions, invitations

Platform and billing
subscription_plans, subscriptions, subscription_events, billing_records, platform_settings

Residents and households
residents, households, household_members, residency_verifications

Document services
document_types, document_requests, document_request_events, issued_documents, document_templates

Meetings
meetings, meeting_attendees, attendance_records, attendance_tokens, meeting_agendas, meeting_minutes, resolutions

Archive and scanning
folders, documents, document_versions, document_ocr_jobs, document_ai_drafts

Finance
budgets, budget_allocations, financial_transactions, transaction_adjustments, financial_approvals, receipts

Committees and projects
committees, committee_memberships, projects, project_milestones, project_updates, project_documents

SK governance
sk_programs, sk_participants, sk_projects, sk_budget_records, sk_meetings, youth_consultations

Health
health_profiles, health_visits, health_referrals, health_campaigns

Safety and referrals
incidents, incident_assignments, incident_evidence, incident_referrals, referral_events

Communication and governance
announcements, notifications, notification_deliveries, audit_logs, support_tickets, system_events

This is a logical starting list, not a requirement to create every table in the first migration. Codex should define each table's columns, types, constraints, indexes, relationships, deletion behavior, and RLS policies before implementing its UI.
Essential database rules
1. Use UUID primary keys where appropriate.
2. Add created_at, updated_at, and relevant creator/approver fields.
3. Use foreign keys and constraints to prevent invalid references.
4. Use unique constraints for values such as a barangay's configured identifier, request reference numbers within their defined scope, and meeting attendance per attendee.
5. Keep membership status separate from authentication status and subscription status.
6. Use controlled status transitions for applications, financial transactions, incidents, and referrals.
7. Use database transactions or server-side functions for multi-step operations that must succeed or fail together.
8. Treat audit records as append-only through database permissions and protected server-side operations.
9. Define indexes for common tenant-scoped searches and reports.
10. Avoid collecting government IDs, exact addresses, health details, or other sensitive fields unless a defined purpose requires them.
5. Security requirements that must not be skipped
This project handles government records, personal information, potentially sensitive health information, and financial data. Security is part of the product's foundation.
- Tenant isolation: Barangay A must never access Barangay B's private records by changing a URL, UUID, request payload, query parameter, or API call.
- Database RLS: Enable Row Level Security for all exposed tables containing private or tenant-owned data. Write and test policies for SELECT, INSERT, UPDATE, and DELETE individually.
- Server-side authority: Verify role, membership, tenant, permission, and subscription on every sensitive operation. Do not trust user-submitted barangay_id, role, is_admin, or approval status.
- Supabase service role: Never expose the service-role key in browser code, frontend environment variables, logs, or public repositories.
- Private storage: Use private buckets and authorization policies; provide short-lived signed URLs only after access checks.
- Authentication: Require secure sessions, account recovery, invitation validation, and appropriate protections for privileged accounts.
- Least privilege: A BHW should not automatically access financial records; a Treasurer should not automatically access health records; a Kagawad should not see every confidential resident record.
- Audit trail: Record important access and mutation events, especially role changes, approvals, financial changes, exports, document issuance, and cross-barangay referrals.
- Data minimization: Keep personal information out of URLs, client logs, analytics, error messages, and public QR payloads.
- File uploads: Validate file type, size, authorization, and content handling. Do not rely only on filename extensions.
- AI privacy: Do not send sensitive records to an external AI service without an approved privacy, legal, and security review.
- Backups: Establish encrypted backups, retention schedules, and tested restoration procedures.
- Rate limits: Protect login, invitation, verification, document generation, QR attendance, and incident reporting against abuse.
- Account lifecycle: Support deactivation, staff departure, role revocation, and session invalidation.
- Data privacy compliance: Design for the Philippine Data Privacy Act of 2012 (RA 10173), applicable implementing rules, records-retention obligations, and other relevant local government requirements. Obtain qualified legal and privacy review before real-world deployment.
A successful login is not sufficient authorization. Every protected action needs its own permission checks.
6. UI and experience design
KABALIKAT should look like a professional civic technology platform, not a generic admin template.









Administrative dashboard

Sidebar navigation, clear metrics, pending tasks, recent activity, and accessible tables.










Resident portal

Mobile-first service requests, announcements, status tracking, and clear actions.


Recommended interface standards:
- Use a consistent design system, spacing scale, typography, colors, and component library.
- Create distinct navigation for Super Admin, barangay officials, SK, health workers, Tanods, and residents.
- Display the active barangay name and account role prominently.
- Provide search, sorting, pagination, filters, empty states, loading states, and useful error messages.
- Use confirmation dialogs for destructive or sensitive operations.
- Include status labels and timestamps in workflow screens.
- Support desktop, tablet, and mobile screen sizes.
- Make forms keyboard accessible and provide labels, validation messages, and focus states.
- Include English and plan for Filipino and Cebuano localization.
- Avoid displaying fake statistics, invented residents, or simulated transactions as if they were live data.
- Clearly distinguish demo data from real records.
- Keep dashboards focused on the tasks relevant to each role.
7. Master prompt for Codex in VS Code
Copy the prompt below into Codex. It establishes the project's purpose, architecture, security rules, modules, and implementation workflow. You can save it as PROJECT_SPEC.md in the repository and use it as the long-term project specification.
KABALIKAT — MASTER PROJECT SPECIFICATION
1. Your Role
Act as a senior full-stack engineer, software architect, PostgreSQL and Supabase security specialist, UI/UX designer, test engineer, and technical documentation writer.

Build KABALIKAT, a secure, multi-tenant Barangay Management System for the Philippines, developed by ArkByte Technologies.

Do not merely generate a design mockup. Build a functional application with a working frontend, database schema, authentication, authorization, data persistence, validation, migrations, automated tests, and documented setup instructions.

Work directly in the existing VS Code repository. Inspect the existing project before making changes. Preserve useful working code, identify existing dependencies, and avoid unnecessarily replacing working files.

If the repository is empty, initialize the project using the architecture below.
2. Product Identity
Product name: KABALIKAT

Developer brand: ArkByte Technologies

Tagline: One Barangay. One Connected Community.

Product purpose: Provide a unified digital platform for barangay administration, resident services, document processing, meetings, financial accountability, committees, SK governance, health programs, community safety, incident reporting, and inter-barangay referrals.

The product should be suitable for a future production deployment, but do not claim legal compliance, production readiness, or completed integrations until these have actually been verified.
3. Mandatory Engineering Rules
1. Use React, TypeScript, Vite, Supabase, and PostgreSQL.
2. Use strict TypeScript. Avoid any, unexplained type assertions, and disabled compiler checks.
3. Use reusable components, modular features, typed data access, and clear separation of responsibilities.
4. Use database migrations for every schema change.
5. Enable and test Row Level Security for private and tenant-owned database tables.
6. Enforce authorization on the server or database, not merely by hiding frontend buttons.
7. Never expose the Supabase service-role key or any other secret to the browser.
8. Never trust a client-provided role, tenant ID, approval status, or subscription status.
9. Never implement a global bypass that allows a barangay to read another barangay's private data.
10. Never silently delete finalized official or financial records.
11. Never represent mock data, placeholder integrations, or simulated AI output as a completed live feature.
12. Do not fabricate legal requirements, signatures, payment confirmations, or emergency responses.
13. Write tests alongside each important feature.
14. Do not leave broken imports, empty event handlers, fake buttons, or nonfunctional navigation.
15. Do not create one giant component or one giant database migration containing the entire application.
16. Do not disable security checks to make tests pass.
17. Document any unavoidable limitation and provide a safe implementation path.
18. Run available type checks, linting, automated tests, and production builds after each meaningful phase.
If a requirement is ambiguous, choose the safest practical default, document the decision, and continue. Ask for clarification only when a decision materially affects security, legal obligations, irreversible actions, or the core product design.
4. Technology Stack
Frontend:
- React
- TypeScript
- Vite
- React Router
- Tailwind CSS
- shadcn/ui
- Lucide React
- TanStack Query
- React Hook Form
- Zod
- Recharts
Backend and infrastructure:
- Supabase Auth
- PostgreSQL
- Row Level Security
- Supabase Storage with private buckets
- Supabase Realtime only where it adds meaningful value
- Supabase Edge Functions or another properly secured server-side runtime for privileged operations
Testing:
- Vitest
- React Testing Library
- Playwright
- Database/RLS integration tests using an isolated test environment
Additional integrations:
- OCR provider behind a documented adapter interface
- Optional AI summarization behind a server-side adapter
- Optional email and SMS providers
- Optional payment provider
- PDF generation
- QR code generation and scanning
Choose compatible, maintained dependencies and document installation and configuration. Do not invent API methods or assume that an external service is configured.
5. Architecture
Organize the application by feature domain rather than placing all files into generic folders.

A recommended structure:

src/
app/
App.tsx
router.tsx
providers/
layouts/
components/
ui/
common/
data-display/
forms/
features/
auth/
platform-admin/
barangays/
memberships/
subscriptions/
residents/
households/
document-services/
meetings/
attendance/
document-archive/
smart-scan/
finance/
committees/
projects/
sk-governance/
health/
incidents/
inter-barangay/
announcements/
notifications/
resident-portal/
audit/
hooks/
lib/
supabase/
validation/
permissions/
formatting/
types/
styles/
test/

supabase/
migrations/
functions/
seed.sql
tests/

docs/
PROJECT_SPEC.md
ARCHITECTURE.md
DATABASE.md
SECURITY.md
SETUP.md
TESTING.md
DEPLOYMENT.md

Adapt this structure when the existing repository already has a sound organization. Keep feature-specific code together and avoid unnecessary abstraction.

Create typed data-access functions for each feature. Do not duplicate authorization logic across components. Keep UI components separate from database operations.
6. Multi-Tenant Design
One platform must support multiple barangays.

Each barangay is a tenant with its own:
- Profile and configuration
- Officials and staff memberships
- Residents and households
- Document requests and issued documents
- Meetings and attendance
- Financial records
- Committees and projects
- SK workspace
- Health workspace
- Incidents and referrals
- Documents and folders
- Announcements and reports
- Subscription and audit history
Tenant isolation is a mandatory security property.

Every tenant-owned record must include a barangay identifier or have a rigorously enforced relationship to a tenant-owned parent.

Create a secure tenant authorization model. Do not infer access merely from the currently selected barangay in the browser.

For each protected operation:
- Authenticate the user.
- Verify active membership in the relevant barangay.
- Verify the required permission.
- Verify access to the specific record.
- Validate the record's tenant relationship.
- Enforce subscription rules where applicable.
- Record important security-relevant events.
Changing a UUID, route, form value, request body, or query parameter must never grant access to another tenant.

Do not build a cross-tenant resident search. Inter-barangay sharing must use the controlled referral workflow described below.
7. Roles and Permission System
Implement these role categories:
1. Super Admin
2. Barangay Captain
3. Barangay Secretary
4. Barangay Treasurer
5. Barangay Kagawad
6. SK Chairman
7. SK Council Member
8. Barangay Health Worker
9. Barangay Tanod
10. Resident
Support configurable permissions within safe limits.

A user may have memberships in more than one tenant only when explicitly authorized. Resolve permissions against the specific membership and tenant involved in each operation.

Use a permission catalog such as:
- residents.read
- residents.create
- residents.update
- residents.verify_residency
- documents.request.review
- documents.issue
- meetings.manage
- attendance.manage
- finance.transactions.read
- finance.transactions.create
- finance.transactions.approve
- committees.manage
- projects.manage
- sk.programs.manage
- health.records.read
- health.records.update
- incidents.create
- incidents.assign
- incidents.resolve
- referrals.create
- referrals.review
- announcements.publish
- reports.export
- memberships.manage
- subscriptions.manage
These permissions are examples. Define the complete catalog based on implemented modules.

Use safe default permissions. Deny access when a permission cannot be determined.

The Super Admin manages the platform and subscriptions. The Super Admin must not automatically gain unrestricted access to confidential barangay records.

The Barangay Captain manages authorized officials and the barangay's settings but must not bypass all privacy controls.

The Secretary manages authorized resident-service and document workflows.

The Treasurer manages permitted financial workflows, with separation of duties for approvals.

Kagawads access assigned committees, projects, and authorized information.

The SK Chairman manages the separate youth governance workspace and authorized SK accounts.

BHWs access only health information necessary for authorized duties.

Tanods access incident and safety workflows appropriate to their assignments.

Residents access their own private requests and records, plus public information.

Do not use role names alone as the only authorization mechanism for every action. Combine role defaults with explicit permissions, tenant membership, resource ownership, and record-level restrictions.
8. Authentication and Account Management
Implement:
- Sign-in
- Sign-out
- Password recovery
- Session persistence and secure expiration handling
- Email verification where configured
- Secure invitation acceptance
- Staff account creation and revocation
- Membership activation and deactivation
- Role and permission assignment
- Account status management
- Appropriate privileged-account protections
The Super Admin creates barangay tenants and sends or generates a secure invitation for the initial Captain.

The Captain invites authorized staff.

The Captain may initiate an SK Chairman invitation through the designated workflow.

Residents use a separate registration and verification process appropriate to the services being offered.

Do not allow unrestricted public Super Admin registration.

Do not store plaintext passwords.

Never let the frontend assign its own trusted role or promote itself to a privileged account.

Revoke membership access promptly when an official leaves their position or loses authorization.
9. Super Admin Portal
Create a dedicated platform administration interface.

Pages:
- Overview
- Barangay directory
- Register barangay
- Barangay details
- Captain invitation and account status
- Subscription plans
- Subscription assignments
- Trial and grace-period management
- Billing records and payment status
- Platform audit events
- System health and integration status
- Support tickets
- Platform settings
Dashboard metrics should come from actual authorized queries. If data is unavailable, display an appropriate empty state rather than invented numbers.

Allow authorized administrators to:
- Register barangays
- Edit permitted tenant metadata
- Configure plans
- Assign a plan
- Activate a trial
- Set trial expiration
- View subscription history
- Suspend or reactivate access under policy
- Review support and security events
Every privileged change must be validated server-side and logged.

Do not create a hidden unrestricted data-access endpoint for support or administration.
10. Barangay Onboarding
Implement an onboarding workflow:
1. Register the barangay.
2. Validate required barangay details and identifiers.
3. Create a secure Captain invitation.
4. Captain accepts the invitation.
5. Captain completes account setup.
6. Captain configures the barangay profile.
7. Captain invites authorized officials.
8. Default permissions are assigned safely.
9. Subscription entitlements are applied.
10. Onboarding progress is displayed.
11. All important actions are logged.
Prevent duplicate tenant identifiers and unauthorized account claiming.

Use explicit pending, accepted, expired, revoked, and completed states for invitations as appropriate.
11. Secretary Workspace
Implement:
- Resident registration
- Household registration
- Resident search with privacy-aware filters
- Residency verification workflow
- Document types and configurable requirements
- Document request review
- Request status tracking
- Approval and rejection with reasons
- Document issuance and release
- Official document numbering
- PDF generation and printing
- Configurable document templates
- Issuance history
- Revocation and correction workflows
- Announcements
- Meeting scheduling
- Agendas, minutes, and resolutions
- Digital folders and archives
- OCR search
- Reports and exports
Use an explicit document-request state machine. Example states:
submitted, under_review, awaiting_requirements, awaiting_approval, approved, rejected, issued, released, and cancelled.

Define allowed transitions and authorized actors.

Do not issue official certificates automatically without required review and approval.

Make document templates configurable. Do not claim a generated certificate is legally valid until its required contents, signatures, and procedures are verified by the responsible authority.
12. Treasurer Workspace
Implement:
- Budget periods
- Budget categories
- Budget allocations
- Income and expense transactions
- Project and program associations
- Receipt and voucher attachments
- Draft and submitted transactions
- Review and approval workflow
- Posting and reconciliation
- Financial reports
- Budget utilization summaries
- Exportable records
- Audit history
- Authorized reversal and correction entries
Separate transaction entry from approval when required by the configured policy.

Validate amounts, dates, categories, budget references, and attachments.

Do not silently modify or delete posted transactions. Correct them through auditable adjustments or reversal entries.

Do not represent a payment as successful based only on a client-side callback. Verify payment status through a trusted server-side integration.

Keep financial records tenant-scoped and permission-controlled.
13. Kagawad Committees and Projects
Allow authorized administrators to configure committees for:
- Peace and order
- Infrastructure
- Health and sanitation
- Education
- Agriculture
- Environment and waste management
- Disaster preparedness
- Livelihood and social services
- Youth and sports
- Other barangay-defined responsibilities
Implement:
- Committee membership
- Assigned responsibilities
- Tasks and deadlines
- Project proposals
- Project milestones
- Budget references
- Progress updates
- Supporting documents
- Before-and-after photographs
- Approval requests
- Accomplishment reports
- Public transparency summaries where approved
A committee membership does not automatically grant access to confidential health, financial, or resident records.
14. SK Governance Workspace
Create a distinct SK workspace with separate navigation and permissions.

Implement:
- SK Chairman account
- Authorized SK council memberships
- Youth registry with appropriate verification and access restrictions
- Youth consultations
- Program and event management
- Participant registration
- Eligibility tracking
- QR attendance
- Project proposals
- Budget records and expenditure tracking
- Supporting receipts
- SK meetings
- Agendas and minutes
- Resolutions
- Youth concern submissions
- Announcements
- Accomplishment reports
- Transparency summaries
Allow the Captain to authorize the SK Chairman account through a secure invitation workflow.

The SK Chairman may invite authorized SK council members within the permissions granted.

Minimize the collection of personal data. Protect minors and sensitive records. Keep private youth records inaccessible to unrelated roles by default.

Financial workflows must preserve audit history and follow applicable approval requirements.
15. BHW Health Workspace
Implement a restricted health module for authorized duties:
- Health profile where justified and lawful
- Home visits
- Follow-up records
- Maternal and child health workflows
- Immunization tracking
- Screening
- Referrals
- Health campaigns
- Outreach schedules
- Restricted notes
- Aggregate statistics
Apply dedicated access policies to health tables and attachments.

Do not expose health records in public dashboards, ordinary announcements, or unrelated search results.

Record access and modification events for sensitive records where appropriate.

Support data retention, correction, and disclosure policies established by the responsible health authority.

Do not invent clinical recommendations or automate clinical decisions without an appropriately validated and authorized workflow.
16. Tanod and Incident Management
Implement:
- Incident submission
- Incident categories
- Severity and location
- Assignment and acknowledgment
- Incident status history
- Patrol scheduling
- Shift logs
- Restricted evidence attachments
- Escalation workflow
- Disaster advisories
- Evacuation information
- Authorized resolution notes
- Reporting and analytics
Use a controlled incident lifecycle, for example:
submitted, acknowledged, assigned, in_progress, referred, resolved, and closed.

Define which roles can make each transition.

Preserve important incident history and prevent unauthorized changes to evidence.

Show clear timestamps and response status. Do not claim that emergency services have been contacted unless a real, verified integration or documented action confirms it.

Display configured emergency contact instructions and advise users to contact appropriate emergency services directly when an immediate emergency requires it.
17. Inter-Barangay Connect
Implement secure, controlled referrals between barangays.

Do not implement unrestricted cross-tenant database access.

A referral must include:
- Originating barangay
- Receiving barangay
- Authorized creator
- Referral purpose
- Minimum necessary information
- Relevant incident reference
- Status
- Creation and acknowledgment timestamps
- Authorized receiving official
- Review and response history
- Disclosure and access audit events
Workflow:
1. Authorized official creates a referral.
2. Server verifies the official's permissions.
3. Server validates the destination tenant.
4. Server checks the permitted disclosure basis and required fields.
5. Referral is created through a controlled server-side operation.
6. Authorized receiving officials can view only the referral assigned to their barangay.
7. The receiving barangay acknowledges and responds.
8. All accesses and changes are logged.
Do not allow receiving officials to search the originating barangay's full resident registry.

Family notifications must follow an explicit, reviewed policy and applicable law. Do not automatically disclose sensitive incident details.

Test all referral access paths with users from different barangays.
18. Resident Portal
Build a mobile-first resident portal with:
- Account registration
- Secure sign-in
- Appropriate identity or residency verification
- Personal profile
- Own document requests
- Request status tracking
- Approved document downloads
- Public announcements
- Program and event registration
- Community feedback
- Incident and hazard reporting
- Published emergency contacts
- Evacuation information
- Notifications
- Service history
Residents must not see other residents' records, internal staff notes, confidential incident evidence, health data, financial records, or private meeting documents.

Use clear status explanations and accessible forms.

Allow public information to be read without exposing private data unnecessarily.
19. SmartScan AI
Build a modular scanning and document-processing pipeline.

Implement:
- Camera or file upload
- Image preview
- Crop and rotate
- Deskew and enhancement when supported
- Original file preservation
- OCR adapter
- Extracted text
- Searchable document metadata
- OCR correction interface
- Draft summary generation
- Draft meeting minutes
- Action-item extraction
- Date and name extraction where supported
- PDF export
- Human review and approval
Use a provider interface so OCR can be replaced without rewriting the application.

If no OCR credentials are available, build a clear mock adapter for development and label it as simulated.

If no AI credentials are available, do not fabricate an AI response. Display a configuration notice or allow a manual workflow.

Send external services only the data permitted by the configured privacy policy. Never expose provider secrets in frontend code.

AI-generated minutes, summaries, and extracted fields remain drafts until reviewed by an authorized official.

Store processing status, provider metadata where safe, and error information without logging sensitive document contents.
20. SmartSession QR Attendance
Implement meeting-specific QR attendance.

Each attendance token must be:
- Associated with a specific meeting
- Valid only during its permitted window
- Verifiable on the server
- Protected against unauthorized reuse
- Free of unnecessary personal information
Validate:
- User or attendee identity
- Meeting existence
- Meeting tenant
- Attendance eligibility
- Token expiration
- Token authenticity
- Duplicate attendance
- Permission to create or correct a record
Use database constraints and transactions to prevent duplicate attendance under concurrent requests.

Provide manual attendance entry for authorized staff with a reason and audit history.

Do not treat possession of a QR code alone as proof of identity.
21. BarangayVault
Implement:
- Private folders and subfolders
- Document metadata
- Tags
- File version history
- OCR indexing
- Permission-aware search
- Download authorization
- Expiring signed URLs
- Retention and archival settings
- Export workflow
- Backup and restoration documentation
Use private Supabase Storage buckets.

Never assume that a hard-to-guess file path provides security.

Validate uploads and enforce limits on file size, content type, and permitted extensions.

Use server-side access checks or tested Storage policies for every private download.

Preserve originals when processing or enhancing documents.
22. Announcements and Notifications
Allow authorized publishing to:
- All residents
- Officials
- Specific authorized roles
- SK audiences
- Program participants
- Other approved groups
Support:
- Drafts
- Preview
- Publication
- Scheduled publication when a supported scheduler exists
- Expiration or archival
- In-app notifications
- Optional email and SMS delivery
- Delivery status
- User preferences
Do not claim a message was delivered when the provider has not confirmed it.

Avoid including sensitive personal or health details in notification content.
23. Subscription System
Create configurable subscription plans and feature entitlements.

Support:
- Free plan
- Pro plan
- Enterprise or LGU plan
- Trial period
- Trial expiration
- Grace period
- Active subscription
- Past-due state
- Suspended state
- Cancellation
- Renewal
- Subscription history
Do not hardcode prices throughout the application.

Create a centralized subscription and entitlement service. Sensitive server operations must validate the authoritative subscription state.

A suspended or expired subscription must not erase official records.

Provide policy-controlled read-only access, export, renewal, and recovery procedures.

Define a continuity policy for essential services, legally required records, and emergency-related functions.

If a payment provider is not configured, build the subscription management interface and a clearly labeled development/test adapter. Never fake a successful real payment.
24. Database Schema
Create migrations for a normalized PostgreSQL schema covering the following domains:

Identity and tenancy:
- profiles
- barangays
- barangay_memberships
- role_definitions
- permissions
- role_permissions
- membership_permissions
- invitations
Subscriptions:
- subscription_plans
- subscriptions
- subscription_events
- billing_records
Residents:
- residents
- households
- household_members
- residency_verifications
Document services:
- document_types
- document_requests
- document_request_events
- issued_documents
- document_templates
Meetings:
- meetings
- meeting_attendees
- attendance_records
- attendance_tokens
- meeting_agendas
- meeting_minutes
- resolutions
Archive:
- folders
- documents
- document_versions
- document_ocr_jobs
- document_ai_drafts
Finance:
- budgets
- budget_allocations
- financial_transactions
- transaction_adjustments
- financial_approvals
- receipts
Committees and projects:
- committees
- committee_memberships
- projects
- project_milestones
- project_updates
- project_documents
SK:
- sk_programs
- sk_participants
- sk_projects
- sk_budget_records
- sk_meetings
- youth_consultations
Health:
- health_profiles
- health_visits
- health_referrals
- health_campaigns
Incidents:
- incidents
- incident_assignments
- incident_evidence
- incident_referrals
- referral_events
Communication and operations:
- announcements
- notifications
- notification_deliveries
- audit_logs
- support_tickets
- system_events
This is the target domain model, not a requirement to implement all tables immediately.

For each implemented table:
- Define UUID identifiers where appropriate.
- Define required fields, types, and constraints.
- Add timestamps and actor references as needed.
- Add tenant relationships and indexes.
- Define foreign keys and safe deletion behavior.
- Define unique constraints.
- Enable RLS.
- Create and test appropriate policies.
- Document sensitive fields and access rules.
Use transactions for operations that require atomicity.

Do not rely on a frontend-generated barangay_id to authorize database access.

Create audit logs through trusted database or server-side operations so users cannot rewrite their own audit history.

Avoid cascade deletion of official, financial, or audit records unless a formally approved retention and deletion policy explicitly permits it.
25. Row Level Security and Storage Security
Security must be designed before implementing sensitive feature screens.

For every private table:
1. Enable RLS.
2. Create explicit policies for required operations.
3. Verify membership in the record's tenant.
4. Verify the required permission.
5. Validate ownership or relationship to the requested record.
6. Prevent cross-tenant access.
7. Test unauthorized and authorized cases.
Use security-definer functions only when necessary, with fixed search paths, minimal privileges, safe input validation, and careful review.

Do not create policies that allow all authenticated users to access every row.

Do not rely solely on auth.uid() if the user's tenant membership and permission must also be checked.

Storage policies must enforce tenant and role access. Use private buckets and expiring signed links.

If using a service-role key in a server-side function, explicitly authorize the caller before performing the privileged operation and limit the function's scope.
26. Audit and Compliance
Log important events such as:
- Authentication and account security events where available
- Invitation creation and acceptance
- Role and permission changes
- Tenant and subscription changes
- Resident-record access and modifications where appropriate
- Document approvals, issuance, revocation, and downloads where required
- Financial changes, approvals, postings, and reversals
- Attendance corrections
- Incident assignments and resolutions
- Cross-barangay referral creation, access, and response
- Sensitive exports
- Administrative overrides
Record actor, tenant, action, target record, timestamp, and an appropriate outcome or reason.

Do not place passwords, access tokens, full medical details, or unnecessary sensitive information in audit logs.

Audit logs must be protected from ordinary user modification.

Create documentation for data retention, access requests, correction, disclosure, incident response, backups, and restoration.

Design for the Philippine Data Privacy Act of 2012 and applicable regulations, but do not claim compliance without appropriate review and verification.
27. User Interface and Design System
Build a professional, clean, accessible, mobile-responsive civic technology interface.

Use:
- A consistent navigation system
- Role-aware menus
- A visible active barangay context
- Reusable form components
- Consistent buttons, tables, dialogs, cards, and status labels
- Accessible colors and typography
- Loading, empty, success, and error states
- Search, filters, sorting, and pagination
- Responsive dashboards
- Confirmation dialogs for sensitive operations
- Clear form validation
- Keyboard accessibility
- English-first copy with a structure that supports Filipino and Cebuano translations
Create distinct layouts for:
- Super Admin
- Barangay officials
- SK workspace
- Health workspace
- Tanod workspace
- Resident portal
Do not show irrelevant modules to a user who lacks access.

Hiding a menu is only a user experience feature; it is not an authorization control.

Do not use fake live metrics or claim that placeholder records are real.
28. Validation, Errors, and Reliability
Use Zod or equivalent schema validation for user inputs.

Validate important rules on the server and database, not only in the browser.

Implement:
- Clear error messages
- Consistent error handling
- Safe logging
- Loading and retry states where appropriate
- Pagination for large datasets
- Query limits
- Database indexes
- Rate limiting for sensitive endpoints
- Duplicate-submission protection
- Transactional writes
- Idempotency for appropriate operations
- Safe handling of expired sessions
- Graceful handling of unavailable external services
Do not expose raw database errors, secrets, stack traces, or sensitive values to end users.
29. Offline and Connectivity Strategy
Design the interface as a Progressive Web App where practical.

Offline support may include:
- Cached application shell
- Offline draft forms
- Locally queued non-sensitive operations where justified
- Sync status indicators
- Conflict detection
- Retry handling
Do not cache sensitive health records, confidential documents, privileged data, or private signed URLs without a reviewed security design.

Clearly distinguish saved locally, pending synchronization, synchronized, and failed operations.

Do not claim a record has been officially submitted or issued until the server confirms it.
30. Accessibility and Localization
Use accessible form labels, keyboard navigation, visible focus indicators, appropriate contrast, and meaningful status messages.

Structure text for future English, Filipino, and Cebuano localization.

Store timestamps consistently and display them in the appropriate local timezone.

Use explicit currency formatting and configurable locale settings.

Do not assume that all residents have fast internet, modern phones, or advanced technical knowledge.
31. Testing Requirements
Create automated tests for important business rules and security boundaries.

Authentication:
- Unauthenticated requests are denied.
- Expired or revoked access is rejected.
- Unauthorized role changes are rejected.
Tenant isolation:
- Barangay A cannot read Barangay B's residents.
- Barangay A cannot modify Barangay B's documents.
- A changed UUID does not bypass access checks.
- Tenant mismatches are rejected in related records.
- Cross-tenant searches are denied except for explicitly authorized referral data.
Roles:
- BHWs cannot access financial data by default.
- Treasurers cannot access restricted health records by default.
- Kagawads see only authorized committee data.
- SK members cannot access unrelated confidential barangay records.
- Residents cannot access other residents' requests.
- Super Admin cannot automatically access all confidential tenant records.
Documents:
- Only authorized staff can approve or issue documents.
- Invalid state transitions are rejected.
- Unauthorized downloads are denied.
- Revocation and correction preserve history.
Finance:
- Unauthorized approvals are rejected.
- Posted transactions cannot be silently deleted.
- Reversals reference the original transaction.
- Audit history is preserved.
Attendance:
- Expired QR tokens are rejected.
- Duplicate attendance is prevented.
- Tokens cannot be used for a different meeting.
- Tenant mismatches are rejected.
Referrals:
- Only authorized users can create referrals.
- Only the designated receiving tenant can access a referral.
- Unrelated resident records remain inaccessible.
- Referral actions are audited.
Subscriptions:
- Client-side changes cannot bypass entitlement checks.
- Expired plans follow the configured policy.
- Official records are preserved during suspension.
Storage:
- Unauthorized file access is denied.
- Signed URLs expire as configured.
- Upload restrictions are enforced.
Reliability:
- Database migrations can be applied to a clean test environment.
- Important operations are atomic.
- Backup restoration procedures are documented and tested where infrastructure permits.
32. Seed Data and Development Environment
Provide a safe development seed with:
- Clearly fictional barangays
- Fictional officials
- Fictional residents
- Sample document types
- Sample meetings
- Sample projects
- Sample transactions
- Sample incidents
- Sample announcements
Never use real residents' personal information as seed data.

Seed data must be created only in a development or test environment.

Document how to create a first Super Admin securely. Do not hardcode production credentials or publish default privileged passwords.

Use environment variables and provide an .env.example containing placeholders only.
33. Documentation
Create and maintain:
- README.md
- docs/PROJECT_SPEC.md
- docs/ARCHITECTURE.md
- docs/DATABASE.md
- docs/SECURITY.md
- docs/SETUP.md
- docs/TESTING.md
- docs/DEPLOYMENT.md
Document:
- System architecture
- Setup commands
- Required environment variables
- Database migrations
- RLS policy design
- Account bootstrap procedure
- Role permissions
- External integrations
- Testing instructions
- Deployment requirements
- Backup and recovery
- Known limitations
- Features not yet implemented
Never document a feature as complete unless it is implemented and tested to the extent stated.
34. Development Roadmap
Phase 1: Foundation
- Inspect repository
- Initialize application
- Configure UI system
- Create database migrations
- Implement authentication
- Implement tenant membership and permissions
- Enable and test RLS
- Build basic layouts
- Add tests and documentation
Phase 2: Core Barangay Operations
- Barangay onboarding
- Official invitations
- Resident and household records
- Announcements
- Document requests
- Document approvals and issuance
- Meetings and attendance
Phase 3: Archives and Productivity
- Folder management
- Document uploads
- OCR adapter
- Searchable archive
- QR attendance
- Meeting minutes and resolutions
- PDF export
Phase 4: Finance and Projects
- Budgets
- Transactions
- Approval workflows
- Receipts
- Committees
- Projects
- Accomplishment reports
Phase 5: Specialized Workspaces
- SK governance
- BHW health workflows
- Tanod and incident management
- Controlled inter-barangay referrals
- Resident incident reporting
Phase 6: Subscriptions and Integrations
- Plans and entitlements
- Trial and grace periods
- Billing integration
- Email and SMS
- Optional AI processing
- Optional OCR provider
- Platform support portal
Phase 7: Hardening and Pilot
- RLS security review
- Cross-tenant attack tests
- Accessibility review
- Performance checks
- Backup restoration
- Deployment configuration
- Pilot testing with authorized users
- Privacy and legal review
- User training and operational documentation
Do not start by implementing every module at once. Complete and verify each phase before expanding the system.
35. Definition of Done
A feature is complete only when:
- Its UI is implemented.
- Its data model exists where needed.
- Its migrations are present.
- Authorization is enforced.
- RLS and storage policies are tested where applicable.
- Input validation is implemented.
- Loading, empty, and error states are handled.
- Important operations have audit history.
- Automated tests cover core business rules.
- Type checking passes.
- Linting passes where configured.
- The production build succeeds.
- Documentation reflects the actual implementation.
If an external service is unavailable, implement a clearly labeled adapter or configuration state rather than pretending the integration works.
36. Initial Instructions
Start by inspecting the repository and reporting:
1. The existing framework and project structure.
2. Existing dependencies and their condition.
3. Existing Supabase setup, if any.
4. Existing tests and build commands.
5. Security risks or architectural problems already present.
6. The recommended implementation sequence.
Then implement Phase 1 only.

Before editing, identify the files that will be created or changed. Make changes incrementally, run checks, fix failures, and report what was actually completed.

Do not stop at a plan or a collection of mockup screens. Build the working foundation.

At the end of Phase 1, provide:
- A concise summary of changes
- The files created or modified
- Database migrations created
- RLS policies implemented
- Tests executed and their results
- Commands to run the application
- Required environment variables
- Known limitations
- The next recommended phase
Proceed methodically. Security, data integrity, maintainability, and actual functionality take priority over implementing a large number of superficial features quickly.




8. How to use this in VS Code
Follow these steps so Codex can build the project in a controlled way.
1. Create the project folder.
   
   Create a folder named kabalikat and open it in VS Code. If you already have a repository, open that repository instead.
2. Save the master specification.
   
   Create docs/PROJECT_SPEC.md and copy the master specification into it. If docs does not exist, create the folder.
3. Open Codex in VS Code.
   
   Give it permission to inspect and edit the project files. Review proposed changes before approving sensitive commands or database operations.
4. Start with Phase 1.
   
   Do not ask it to implement all modules in one request. Begin with the prompt below.
5. Verify before moving on.
   
   Ask Codex to run the checks, review the changes, fix failures, and explain what is genuinely working. Continue to Phase 2 only after the foundation is verified.
First prompt to send Codex
Read docs/PROJECT_SPEC.md completely before making changes.

Inspect the current repository and begin Phase 1 of KABALIKAT.

First, report the existing project structure, dependencies, setup status, and any security concerns. Then create an implementation checklist for Phase 1.

Implement the foundation incrementally:
1. Configure React, TypeScript, and Vite if necessary.
2. Set up Tailwind CSS, shadcn/ui, Lucide icons, and React Router.
3. Establish the feature-based project structure.
4. Configure Supabase client initialization using public environment variables only.
5. Create database migrations for barangays, profiles, memberships, roles, and permissions as needed for the foundation.
6. Implement authentication and secure tenant membership resolution.
7. Implement and test the initial Row Level Security policies.
8. Create the initial responsive layouts for Super Admin and barangay users.
9. Add meaningful loading, empty, and error states.
10. Add automated tests for authentication, permissions, and tenant isolation.
11. Write setup instructions and an .env.example with placeholders.
Do not implement the entire system yet. Prioritize a secure and testable foundation.

Do not expose service-role keys, trust client-supplied roles, or allow users to change their tenant ID to gain access to another barangay.

Before finishing, run the available type checks, linting, tests, and production build. Fix the failures you can resolve.

Report the exact files changed, commands run, test results, remaining limitations, and the next implementation steps. Never claim a feature or security test is complete unless you have verified it.




9. Follow-up prompts for each phase
Once Phase 1 works, use these prompts in sequence.
Phase 2 — Core barangay operations

Residents, households, staff, document requests, announcements, meetings, and attendance.
Copy Phase 2 prompt
Phase 3 — SmartScan and archives

Private files, OCR, document search, PDF output, meeting minutes, and QR attendance.
Copy Phase 3 prompt
Phase 4 — Finance and projects

Budgets, transactions, receipts, approval workflows, committees, and project transparency.
Copy Phase 4 prompt
Phase 5 — SK, health, safety, and referrals

Specialized workspaces with strict access boundaries.
Copy Phase 5 prompt
Phase 6 — Subscription and integrations

Plans, entitlements, trials, billing, email, SMS, and optional AI providers.
Copy Phase 6 prompt
Phase 7 — Security review and pilot

Adversarial testing, recovery, accessibility, deployment, and operational readiness.
Copy Phase 7 prompt

10. Important advice before real deployment
- Create a separate Supabase project for development and production.
- Never use real residents' personal data during early development.
- Test tenant isolation with at least two fictional barangays and multiple role types.
- Keep database migrations and security policies in version control.
- Do not commit .env files or API secrets.
- Review every migration that changes permissions, foreign keys, or deletion behavior.
- Have a qualified privacy or legal professional review the treatment of official records, health data, youth data, signatures, retention, and inter-barangay disclosure.
- Do not advertise KABALIKAT as a fully operational government system until the relevant workflows, security controls, integrations, and operational processes have been verified.
My recommendation: build the authentication, tenant isolation, role permissions, and database security first. Those foundations are much harder to repair after the system contains real residents, financial transactions, and confidential documents.











Is this conversation helpful so far?