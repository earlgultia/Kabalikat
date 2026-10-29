# Deployment (Development status)

The Vite app can be built with `npm run build` and deployed as static files to a static hosting provider. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time. Apply reviewed SQL migrations to Supabase separately from frontend deployment.

For Vercel, open the project’s **Settings → Environment Variables** and add those two variables for the Production environment (and Preview/Development environments if needed). Copy their values from your local `.env` file, then redeploy so the new build can use them. Vite embeds `VITE_` values in the browser bundle at build time. The Supabase anon/publishable key is intended for browser use and must be protected by database RLS; a committed `.env` containing these values is public to anyone who can read the repository and must never contain privileged credentials. `.env.example` contains placeholders only. Never add a Supabase service-role or secret key to a `VITE_` variable, a committed `.env`, or Vercel's client-side environment.

`vercel.json` provides SPA deep-link rewrites and browser security headers. Its Content Security Policy permits same-origin assets plus Supabase HTTP/WebSocket endpoints on `supabase.co` and `supabase.in`; deployments using a different Supabase host must update `connect-src` accordingly.

This is not production-ready. No production Supabase project, CI pipeline, backup plan, monitoring, domain, or release process is configured. Phase 2 migrations and pgTAP policies have not been verified against a live test instance. Do not use real resident data until live database policies and operational/privacy reviews are complete.
