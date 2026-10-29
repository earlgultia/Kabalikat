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

On Windows PowerShell, use `Copy-Item .env.example .env.local` for the copy step. Apply migrations `0001_foundation.sql` through `0057_scope_role_announcement_delivery.sql` in order to a disposable development Supabase project. The project must have Supabase Auth and Storage enabled. No seed data or privileged credentials are included.

Without the environment variables the app renders a clear configuration notice and disables sign in. Apply migrations with the Supabase CLI after linking a project, or through the Supabase SQL editor. Do not point early development at a production database.

For password recovery, configure the Supabase Auth email provider and allow the application URLs used in development and deployment, including the `/reset-password` redirect path. The app sends the reset email through Supabase Auth; it does not send email directly. Verify the deployed redirect URL in the Supabase Auth URL configuration before relying on recovery links.

Invitation links are copied and delivered manually by an authorized operator. A recipient can sign in or create an account from the invitation page. Creating an account alone grants no tenant membership; the database requires the valid invitation token and matching account email. Configure Supabase Auth email confirmation and its redirect URL allowlist for `/accept-invitation`. The app does not send invitation email or SMS.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```
