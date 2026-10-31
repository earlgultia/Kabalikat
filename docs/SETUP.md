# Local setup

## Requirements

Node.js 20.19+ or 22.12+, npm, and a Supabase project for authentication and database features.

## Run locally

```sh
npm install
cp .env.example .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` for the copy step. Apply migrations `0001_foundation.sql` through `0107_paginated_meeting_status_history.sql` in order to a disposable development Supabase project. The project must have Supabase Auth and Storage enabled. No seed data or privileged credentials are included.

Without the environment variables the app renders a clear configuration notice and disables sign in. Apply migrations with the Supabase CLI after linking a project, or through the Supabase SQL editor. Do not point early development at a production database.

For password recovery, configure the Supabase Auth email provider and allow the application URLs used in development and deployment, including the `/reset-password` redirect path. The app sends the reset email through Supabase Auth; it does not send email directly. Verify the deployed redirect URL in the Supabase Auth URL configuration before relying on recovery links.

Invitation links are copied and delivered manually by an authorized operator. A recipient can sign in or create an account from the invitation page. Creating an account alone grants no tenant membership; the database requires the valid invitation token and matching account email. Configure Supabase Auth email confirmation and its redirect URL allowlist for `/accept-invitation`. The app does not send invitation email or SMS.

## Provision the first platform administrator

The application intentionally has no public Super Admin registration. Provision the first platform administrator through the Supabase Dashboard and SQL Editor after migrations `0001_foundation.sql` through `0107_paginated_meeting_status_history.sql` have been applied.

1. In the Supabase Dashboard for the intended project, open **Authentication → Users** and invite the administrator's individually controlled email address. The administrator should set their own password from the invitation flow. Do not use a shared/default password.
2. After the account appears in the Auth users list, open **SQL Editor** for the same project and run the following. Replace the sample email with the exact invited account email:

   ```sql
   do $bootstrap$
   declare
     v_user_id uuid;
   begin
     select id into v_user_id
     from auth.users
     where lower(email) = lower('admin@example.com');

     if v_user_id is null then
       raise exception 'No Supabase Auth user found for the supplied administrator email';
     end if;

     insert into public.platform_administrators (user_id)
     values (v_user_id)
     on conflict (user_id) do nothing;
   end;
   $bootstrap$;
   ```

3. Sign in to KABALIKAT with that account. The protected administrator registry grants access to `/platform`; no barangay membership is created by this step.
4. Confirm the account can open the platform workspace, then enable and enforce the deployment's approved authentication safeguards, including MFA where available. Keep this SQL out of migrations and source control; run it only in the intended project using an authorized operator account.

The platform administrator can then create barangay workspaces and initial Captain invitations. Platform access does not grant access to private resident, health, document, meeting, or financial records.

## Checks

Recent database changes are documented in [DATABASE.md](DATABASE.md) and [PROJECT_TIMELINE.md](PROJECT_TIMELINE.md). Apply the migrations in order through `0107_paginated_meeting_status_history.sql`; resident-owned personal data exports now fetch complete record sets in bounded batches.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```
