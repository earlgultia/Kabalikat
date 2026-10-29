# Deployment (Development status)

The Vite app can be built with `npm run build` and deployed as static files to a static hosting provider. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time. Apply reviewed SQL migrations to Supabase separately from frontend deployment.

This is not production-ready. No production Supabase project, CI pipeline, backup plan, monitoring, domain, or release process is configured. Phase 2 migrations and pgTAP policies have not been verified against a live test instance. Do not use real resident data until live database policies and operational/privacy reviews are complete.
