# Testing

Run the frontend checks with:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The Vitest suite covers frontend-level utility behavior. Database boundary tests live in `supabase/tests/database/` and use pgTAP. Run them against a disposable local Supabase project after applying migrations. They cover foundation membership and platform separation, Phase 2 tenant isolation, single household head handling, resident-owned document resubmission, invitation revocation, archive tenant isolation, meeting record isolation, QR attendance rules, and financial approval and void separation. Receipt storage and database policies are defined in migration `0010_financial_receipts.sql`.

The current workspace has no Supabase CLI, Docker, or configured database connection. SQL integration tests and live migration application therefore remain unverified here; do not treat passing frontend checks as proof of production RLS security.
