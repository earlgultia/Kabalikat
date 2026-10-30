# Deployment (Development status)

The Vite app can be built with `npm run build` and deployed as static files to a static hosting provider. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time. Apply reviewed SQL migrations to Supabase separately from frontend deployment.

For Vercel, open the project’s **Settings → Environment Variables** and add those two variables for the Production environment (and Preview/Development environments if needed). Copy their values from your local `.env` file, then redeploy so the new build can use them. Vite embeds `VITE_` values in the browser bundle at build time. The Supabase anon/publishable key is intended for browser use and must be protected by database RLS; a committed `.env` containing these values is public to anyone who can read the repository and must never contain privileged credentials. `.env.example` contains placeholders only. Never add a Supabase service-role or secret key to a `VITE_` variable, a committed `.env`, or Vercel's client-side environment.

## Progressive web app

The production build emits a root-scoped service worker, install manifest, and KABALIKAT icons. The service worker precaches the built app shell and static assets, then serves the app shell for offline navigation. It deliberately does not cache Supabase Auth, REST, storage, or realtime requests, so sign-in and barangay data require an internet connection. Deploy over HTTPS for browser installation and service-worker support. On iPhone or iPad, use Safari’s Share menu and choose **Add to Home Screen**.

`vercel.json` provides SPA deep-link rewrites and browser security headers. Its Content Security Policy permits same-origin assets plus Supabase HTTP/WebSocket endpoints on `supabase.co` and `supabase.in`; deployments using a different Supabase host must update `connect-src` accordingly.

This is not production-ready. GitHub Actions is configured to run lint, TypeScript checks, Vitest, and the production build, with a separate isolated workflow for migration application and pgTAP. Workflow success has not been confirmed here. No production Supabase project, monitoring, domain, or release process is configured, and backup restoration has not been rehearsed. Follow [the backup and recovery runbook](BACKUP_RECOVERY.md) to plan and document a separate non-production restoration exercise. Do not use real resident data until database policies and operational/privacy reviews are complete.
