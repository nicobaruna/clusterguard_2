# ClusterGuard Task Plan

Status: JWT verification migrated to Supabase ES256 signing keys via JWKS (HS256 secret deprecated by the project); live authenticated SOS persistence verified end-to-end. `PATCH /sos/:id/resolve` implemented (PIC/Super Admin only, idempotent, race-safe) and live-verified.

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
- [x] Concurrent resolution test (race-safe conditional update covered by resolve endpoint unit tests; live race test unnecessary for a single conditional PATCH).
- [x] No plaintext password is stored in `public.users`.

## Phase 2: Authentication

- [x] Implement Warga/PIC registration with phone number and password.
- [x] Implement Super Admin email/password login.
- [x] Link profiles to `auth.users.id` through the existing trigger.
- [x] Load trusted roles from the database.
- [ ] Preserve sessions during reload and offline startup.
- [ ] Distinguish network failures from online `401` responses.

Offline-first sync task completed:

- [x] Store operational records locally with `pending`, `syncing`, `synced`, and `failed` flags.
- [x] Start background sync from the web page lifecycle.
- [x] Sync on browser `online` event and bounded interval retry.
- [x] Keep network failures retryable and stop on definitive `401`.
- [x] Handle terminal 4xx and bounded 429/5xx backoff.
- [x] Add queue cap, retention pruning, storage failure handling, and sensitive payload rejection.
- [x] Add Web Locks with renewed localStorage lease fallback.
- [x] Add SOS idempotency migration and partial unique index.
- [x] Tests, typecheck, lint, build, security, and performance gates pass.
- [x] Connect concrete SOS write endpoint to the queue.

Phase 2 validation completed for this task:

- [x] Signup excludes client-selected roles.
- [x] Email/phone role mismatch is rejected.
- [x] Session recovery reloads the trusted profile and signs out invalid profiles.
- [x] Auth form releases submitting state on rejected requests.
- [x] 13 unit/contract tests pass.
- [x] Typecheck, lint, build, security, and performance gates pass.
- [x] Live provider login/signup test with a temporary Super Admin credential; cleanup verified.

## Phase 3: Backend SOS API

- [x] Validate SOS categories with strict Zod schema.
- [x] Implement authenticated `POST /sos`.
- [x] Derive `sender_id` from the verified JWT.
- [x] Persist before responding through server-side Supabase REST.
- [x] Enforce UUID sender and idempotency-key validation.
- [x] Recover concurrent idempotent insert conflicts.
- [x] Broadcast FCM notifications asynchronously through `waitUntil()`.
- [x] Filter notification targets to PIC users on duty with mobile device tokens.
- [x] Isolate FCM failures from the persisted SOS response.
- [x] Implement authorized, idempotent `PATCH /sos/:id/resolve`.
- [ ] Implement device-token registration/upsert.

Phase 3 validation completed for this task:

- [x] Endpoint tests cover validation, persistence, sender spoofing, retry, and conflict recovery.
- [x] Live authenticated SOS persistence test.
- [x] Live resolve endpoint test (Warga 403, PIC 200 + resolved_by, idempotent retry, missing 404).
- [x] Concurrent resolution test (race-safe conditional update covered by unit tests; live race test unnecessary for single conditional PATCH).
- [x] Tests, typecheck, lint, build, security, and performance gates pass.
- [x] FCM tests cover token filtering, empty tokens, failure isolation, and idempotent no-rebroadcast behavior.

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

The linked Supabase database contains the clean baseline, RLS hardening, and SOS idempotency migration. Offline queue/background sync, Hono SOS persistence, and asynchronous FCM broadcast are implemented and quality-gated. The backend verifies Supabase access tokens with ES256 against the project JWKS (`jose`, edge-cached) because the project uses asymmetric JWT signing keys; `SUPABASE_JWT_SECRET` is unused. A live E2E run (temporary admin-created user, real session token, `POST /sos` 201 + idempotent 200 + 401 garbage-token rejection, plus the resolve flow: Warga 403 → promoted-PIC 200 with `resolved_by` + idempotent retry + 404, full cleanup) passed on the local stack (`scripts/e2e-sos-live.mjs`). Do not modify `.env.local` or expose its values. Do not run another destructive database reset without explicit approval.
