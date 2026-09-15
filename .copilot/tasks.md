# ClusterGuard Task Plan

Status: Live adversarial RLS validation complete; commit/push approval required.

## Phase 0: Confirm decisions

- [ ] Route all database writes through the Hono backend.
- [ ] Decide whether inactive PICs are excluded from SOS notifications.
- [ ] Decide whether Warga notifications use FCM, Realtime/browser notifications, or both.
- [ ] Decide where PIC duty status is stored.
- [ ] Define the first Super Admin bootstrap and promotion process.
- [ ] Decide how monthly reports are generated.

## Rebuild checkpoint

- [x] Reset linked Supabase database with explicit user approval.
- [x] Removed the previous rebuild artifacts and stale migration history.
- [x] Preserved documentation, `.env.local`, `.git`, and `.copilot` checkpoints.
- [x] Recreate the baseline npm workspace.
- [x] Create the first clean Supabase migration.
- [x] Install dependencies and run typecheck/build/tests.

## Phase 1: Database and security

- [x] Create the authoritative baseline Supabase migration/schema.
- [x] Finalize baseline `users`, `sos_events`, and `user_devices`.
- [x] Add PIC duty status.
- [x] Add constraints, indexes, foreign keys, and device-token uniqueness.
- [x] Enable RLS on all public tables.
- [x] Add role-based policies for Warga, PIC, and Super Admin.
- [ ] Define safe Super Admin bootstrap and promotion.
- [x] Remove authentication dependence on `public.users.password`; Supabase Auth remains the password verifier.
- [x] Apply and verify migrations against the linked Supabase project.

Phase 1 validation:

- [x] Fresh migration succeeds.
- [x] RLS remains enabled after migration.
- [x] Policy contract and JWT sender-isolation tests pass.
- [x] Live adversarial RLS session tests.
- [ ] Concurrent resolution test (deferred until SOS resolve endpoint/function exists).
- [x] No plaintext password is stored in `public.users`.

## Phase 2: Authentication

- [ ] Implement Warga/PIC registration with phone number and password.
- [ ] Implement Super Admin email/password login.
- [ ] Link profiles to `auth.users.id`.
- [ ] Load trusted roles from the database.
- [ ] Preserve sessions during reload and offline startup.
- [ ] Distinguish network failures from online `401` responses.

## Phase 3: Backend SOS API

- [ ] Validate SOS categories with Zod.
- [ ] Implement authenticated `POST /sos`.
- [ ] Derive `sender_id` from the verified JWT.
- [ ] Persist before responding.
- [ ] Broadcast notifications asynchronously with `waitUntil()`.
- [ ] Implement authorized, idempotent `PATCH /sos/:id/resolve`.
- [ ] Implement device-token registration/upsert.

## Phase 4: Warga and Super Admin PWA

- [ ] Build accessible authentication screens.
- [ ] Build slider-based SOS confirmation.
- [ ] Add Realtime status updates.
- [ ] Add immediate fallback for request failure/timeout.
- [ ] Add 30-second unresolved-event fallback.
- [ ] Add sequential `tel:` fallback calls.
- [ ] Build Super Admin user, PIC, SOS history, and report screens.
- [ ] Cache static assets only.

## Phase 5: PIC mobile application

- [ ] Create Expo/React Native app.
- [ ] Register and sync FCM tokens.
- [ ] Add active-duty status.
- [ ] Implement foreground/background/locked/force-closed alert behavior.
- [ ] Implement persistent alarm lifecycle and resolve action.
- [ ] Add PIC history and self-SOS.

## Phase 6: Deployment

- [ ] Configure local, preview, and production environments.
- [ ] Deploy Hono to Cloudflare Workers.
- [ ] Deploy PWA to Vercel.
- [ ] Add GitHub Actions using GitHub Secrets.
- [ ] Add monitoring and free-tier quota checks.

## Phase 7: End-to-end verification

- [ ] Verify Warga SOS persistence and PIC delivery.
- [ ] Verify PIC resolution and Realtime propagation.
- [ ] Verify immediate and 30-second fallback behavior.
- [ ] Verify offline login persistence.
- [ ] Verify RLS, authorization, replay, duplicate-submit, and concurrent-resolve behavior.

## Open decisions requiring user approval

1. Warga notification channel: FCM, Realtime/browser, or both.
2. Exclude inactive PICs from notifications: yes/no.
3. All writes through Hono: yes/no.
4. PIC duty status location: `public.users` or separate table.
5. Super Admin bootstrap/promotion procedure.
6. Warga visibility of other residents' SOS events.
7. Supported Android/iOS versions and notification limitations.
8. Measurable notification reliability target.
9. Expected users/devices/events for the free-tier budget.
10. Monthly report generation approach.

## Current state

The linked Supabase database contains the clean baseline plus RLS hardening migration. Local typecheck, build, lint, tests, security review, and performance review pass. Live adversarial RLS session tests pass; concurrent resolution is deferred until the SOS resolve endpoint/function exists. Do not modify `.env.local` or expose its values. Do not run another destructive database reset without explicit approval.
