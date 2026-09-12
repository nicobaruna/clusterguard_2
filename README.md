# ClusterGuard

Minimal starter implementation for the ClusterGuard emergency SOS platform described in the design documents.

## Included

- Hono + Cloudflare Worker backend in `apps/api`
- Next.js PWA-style frontend in `apps/web`
- Supabase schema in `database/schema.sql`
- Deployment config for the worker

## Quick start

1. Install dependencies: `npm install`
2. Start the web app: `npm run dev`
3. Start the API locally: `npm run dev --workspace @clusterguard/api`

## Notes

This is a design-accurate foundation rather than a full production rollout. It includes the core patterns from the PRD: category validation, auth middleware placeholder, status fallback UI, and the emergency SOS flow.
