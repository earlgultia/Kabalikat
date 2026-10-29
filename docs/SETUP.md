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

On Windows PowerShell, use `Copy-Item .env.example .env.local` for the copy step. Apply migrations `0001_foundation.sql` through `0026_barangay_project_tracking.sql` in order to a disposable development Supabase project. The project must have Supabase Auth and Storage enabled. No seed data or privileged credentials are included.

Without the environment variables the app renders a clear configuration notice and disables sign in. Apply migrations with the Supabase CLI after linking a project, or through the Supabase SQL editor. Do not point early development at a production database.

Invitation links are copied and delivered manually by an authorized operator. A recipient can sign in or create an account from the invitation page. Creating an account alone grants no tenant membership; the database requires the valid invitation token and matching account email. Configure Supabase Auth email confirmation and its redirect URL allowlist for `/accept-invitation`. The app does not send invitation email or SMS.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```
