# Implementation status

Last updated: 2026-11-10. Verification evidence is listed at the bottom.

## P0 — Non-AI collaboration MVP

| Requirement | Status | Notes |
|---|---|---|
| Email/password auth, secure sessions | ✅ | better-auth with Prisma adapter, HTTP-only cookies, built-in rate limiting. OAuth providers not wired (config-only change). |
| Organizations, roles, project membership, invitations | ✅ | Owner/Manager/Editor/Actor org roles, project-scoped Manager/Editor/Actor; invitations are SHA-256 token-hashed, email-bound, 7-day expiry; accept flow validates token, expiry, org and email. |
| Project creation (name, description, deadline, source language, videos, target languages) | ✅ | `/projects/new`; BCP 47 normalization for languages. |
| Video / language track / segment data model | ✅ | Prisma schema with the PRD constraints and indexes (`Segment(languageTrackId,status)`, `Assignment(actorUserId,active,dueAt)`, `Comment(recordingVersionId,timestampMs)`, `Notification(userId,readAt)`, unique `(segmentId, versionNumber)`, `(videoId, locale)`, `(organizationId, providerId)`). |
| Excel/CSV import preview → map → validate → commit | ✅ | `.xlsx` (ExcelJS) and `.csv` (PapaParse), sheet selection, synonym-based column suggestions, row-level errors/warnings, atomic commit with `all` / `valid_only`, dedupe on `(project, video, language, segment_external_id)`, never overwrites segments that have recordings or approvals, import audit + counts. Raw workbook is not persisted (only validated rows until commit). |
| Assignments and actor workspace | ✅ | One active assignee, due dates, notifications; `/my-assignments` grouped by urgency; actors see only assigned segments (404 otherwise). |
| Project dashboard (KPIs, language progress, work queue, activity) | ✅ | `approved_percentage` with `N/A` on zero required segments; server-side filtering/pagination; 15 s polling. |
| Direct audio upload, processing, playback, versions | ✅ | Upload intent → signed PUT (S3 presigned or local HMAC URL) → complete → `recording.process` job (ffprobe validation, duration, peaks) → `READY` → segment `SUBMITTED`. Short-lived playback URLs, byte-range support on the local driver. Idempotency keys on upload intents. |
| Review workspace: waveform, transport, speed, version selector, timestamped comments, approve/request revision | ✅ | Canvas waveform (server peaks or WebAudio fallback), click/keyboard seek, comment markers, 0.75–1.5× speed, keyboard shortcuts, comments tied to `recordingVersionId` + `timestampMs`, historical feedback labelled on older versions, reason required for revision/reopen, stale-revision and concurrent-reviewer protection, reopen approved segments. |
| In-app notifications, audit history | ✅ | Notification center + bell popover, mark read/unread; `AuditEvent` on every mutation; transactional `OutboxEvent` drained by the worker (console email transport). |
| Security tests (tenant isolation, roles) | ✅ | Integration suite `tests/integration/tenant-isolation.test.ts`; e2e cross-tenant API check. |

## P1 — AI provider configuration and draft generation

| Requirement | Status | Notes |
|---|---|---|
| Encrypted ElevenLabs credential settings (owner-only) | ✅ | AES-256-GCM, random nonce, key-version metadata and previous-key rotation support; replace-only UI; masked `last4`; never returned in any API response. |
| Test connection, voice/model discovery | ✅ | Server-side `validateCredential` (`GET /v1/user`), `voices.search` (`/v2/voices`), `models.list` (`/v1/models`, filtered to TTS-capable); 5-minute discovery cache; sanitized error mapping. |
| Provider adapter interface + ElevenLabs + mock | ✅ | `AIProviderAdapter`; ElevenLabs via official SDK `textToSpeech.convert` with `mp3_44100_128`; deterministic mock (WAV tones) for dev/CI. The live ElevenLabs path is implemented against the SDK types but has **not been exercised against a real account** in this build. |
| Generation queue → reviewable AI version | ✅ | `ai.generate` job with retries/backoff, cooperative cancellation, retry action, usage counters, per-org monthly character quota; output stored as `AI_GENERATED` version that re-enters the standard review flow (never auto-approved). |
| Default provider, enable/disable, usage counters | ✅ | Settings card per registered adapter. |
| Cost estimate | ⚠️ | Shown only for the mock provider (`costEstimateAvailable`); ElevenLabs reports "estimate unavailable" per PRD guidance. |

## P2 — Operational improvements (not in scope for this build)

Email delivery to a real provider (transport interface exists), bulk assignments, duration-weighted progress, exports, additional provider adapters, organization-level retention settings, multipart/resumable uploads.

## Known limitations / deviations

- Rate limiting is in-memory per instance (documented; swap for Redis when scaling out).
- Job queue is PostgreSQL-backed instead of BullMQ/Redis (PRD allowed an equivalent durable queue); it removes the Redis dependency for local development.
- Waveform peaks require `ffmpeg`/`ffprobe` on the worker host; without them processing still succeeds and the browser decodes the audio to draw the waveform.
- Playback URLs for the local storage driver point at `APP_BASE_URL`; the dev server must run on that URL (e.g. `APP_BASE_URL=http://localhost:3100 pnpm dev -p 3100`).
- No dark theme toggle yet (tokens are defined for `.dark`).
- `IN_REVIEW` is entered automatically when a reviewer opens the latest submitted version.

## Verification evidence (2026-11-10)

- `pnpm typecheck` — passes.
- `pnpm lint` — passes (0 errors).
- `pnpm test` — 10 files / 51 tests passed (unit: policy, transitions, secrets/redaction, imports, providers, storage; integration: full review workflow incl. concurrent approvals, tenant isolation, AI provider settings + generation + retry/cancel, spreadsheet import idempotency).
- `pnpm build` — production build compiles; all routes are dynamic (server-rendered on demand), proxy registered.
- `pnpm test:e2e` — 4/4 Playwright journeys pass against the production build: manager assigns → actor uploads → editor comments + requests revision → actor uploads v2 → editor approves (v1 feedback stays historical, dashboard shows 100%); actor cannot see unassigned segments (API 404 + page); owner saves/tests mock provider key (plaintext never returned) and editor generates an AI draft that lands in review; unauthenticated (401) and cross-tenant (404) API access refused.
- Manual browser walkthrough (Chrome): sign-in, projects list, dashboard, review workspace (waveform seek, timestamped comment with marker, playback), AI draft via mock provider producing v2 with ffmpeg peaks, approval dialog, settings pages; no console errors after fixes.

Bugs found and fixed during verification: job-claim SQL compared UTC timestamps with session-local `now()` (retries fired immediately); user ids from better-auth are not UUIDs so assignment/team schemas now accept opaque ids; Base UI buttons rendering links needed `nativeButton={false}`.
