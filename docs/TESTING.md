# Testing

Run the frontend checks with:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The Vitest suite covers frontend-level utility behavior. Database boundary tests live in `supabase/tests/database/` and use pgTAP. Run them against a disposable local Supabase project after applying migrations. They cover foundation membership and platform separation, Phase 2 tenant isolation, single household head handling, resident-owned document resubmission and public verification, invitation revocation, archive tenant isolation, meeting record isolation, QR attendance rules, financial approval and void separation, role-targeted announcement delivery and access boundaries, resident profile correction ownership, private feedback ownership and lifecycle, and platform-only subscription controls. The announcement suite also covers published-post retargeting, duplicate prevention, and loss of visibility for the former target. Receipt storage and database policies are defined in migration `0010_financial_receipts.sql`.

For local database verification, install Docker Desktop and the Supabase CLI, then run `supabase db start` followed by `supabase test db`. The checked-in `supabase/config.toml` creates an isolated local project and does not link to or modify the hosted Supabase project. It currently targets PostgreSQL 17; set `db.major_version` to the hosted project's version before treating the local result as version-matched verification.

GitHub Actions runs lint, typecheck, Vitest, and the production build on pushes and pull requests. A separate workflow applies every database migration and runs pgTAP in an isolated runner. Both workflows must complete successfully in GitHub before implementation and database verification can be marked complete. pgTAP coverage for later modules is still being expanded. Do not treat passing frontend checks alone as proof of production RLS security.
