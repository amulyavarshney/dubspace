# Dubspace — Dubbing Workspace

Multi-tenant dubbing project management, audio review and voice-actor collaboration. Replaces the spreadsheet as the authoritative record: import a project from Excel/CSV, organise videos into language tracks and segments, assign recording work, upload or generate audio, leave timestamped feedback, request revisions, approve versions and watch delivery readiness.

The UI is ElevenLabs-inspired (neutral surfaces, Inter, pill buttons, audio-first controls) but uses original **Dubspace** branding.

## Stack

- **Web / API**: Next.js 16 (App Router, route handlers under `/api/v1`), React 19, TypeScript (strict), Tailwind v4, shadcn/ui (Base UI), TanStack Query, Zod.
- **Database**: PostgreSQL + Prisma 7 (migrations in `prisma/migrations`).
- **Auth**: better-auth (email/password, secure HTTP-only sessions), organization + project memberships, token-hashed invitations.
- **Storage**: S3-compatible adapter (MinIO/AWS/R2) with short-lived presigned URLs, or a local filesystem driver with HMAC-signed URLs for development.
- **Background jobs**: durable PostgreSQL-backed queue (`FOR UPDATE SKIP LOCKED`, retries with exponential backoff, idempotency keys) + transactional outbox. Runs inline in `next dev` or as a separate `pnpm worker` process.
- **Audio processing**: ffprobe/ffmpeg in the worker validate real audio bytes, extract duration and waveform peaks (gracefully skipped when ffmpeg is absent).
- **AI providers**: adapter interface with an **ElevenLabs** adapter (official SDK) and a deterministic **mock** adapter for dev/CI. Credentials are AES-256-GCM encrypted at rest with key-version metadata.
- **Tests**: Vitest (unit + integration against a real test database and storage), Playwright (end-to-end).

## Quick start (local, no Docker)

Prerequisites: Node 22+, pnpm 10, PostgreSQL 15+ running locally, optionally `ffmpeg`/`ffprobe` on PATH.

```bash
pnpm install
cp .env.example .env            # then edit DATABASE_URL / secrets (see below)
createdb dubbing_workspace
pnpm prisma migrate deploy
pnpm db:seed
pnpm dev                        # http://localhost:3000
```

Generate secrets:

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # CREDENTIAL_ENCRYPTION_KEY (must decode to 32 bytes)
openssl rand -base64 32   # LOCAL_STORAGE_SIGNING_SECRET
```

Demo accounts (password `password123`): `owner@dubspace.test`, `manager@dubspace.test`, `editor@dubspace.test`, `maria.actor@dubspace.test`, `jonas.actor@dubspace.test`. `outsider@dubspace.test` owns an unrelated organization for tenant-isolation checks.

## Quick start (Docker Compose for infra)

```bash
docker compose up -d            # PostgreSQL + MinIO (bucket auto-created)
cp .env.example .env
# set STORAGE_DRIVER=s3 (MinIO values in .env.example already match docker-compose)
pnpm setup                      # install, generate, migrate, seed
pnpm dev
```

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Session signing secret (≥16 chars) |
| `APP_BASE_URL` | Public base URL (used for auth and signed local-storage URLs) |
| `STORAGE_DRIVER` | `local` (dev) or `s3` |
| `LOCAL_STORAGE_DIR`, `LOCAL_STORAGE_SIGNING_SECRET` | Local driver settings |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | S3 driver settings |
| `INLINE_WORKER` | `true` runs the job worker inside the Next.js process (dev); set `false` in production and run `pnpm worker` |
| `WORKER_POLL_INTERVAL_MS` | Queue polling interval |
| `CREDENTIAL_ENCRYPTION_KEY`, `CREDENTIAL_ENCRYPTION_KEY_VERSION` | Base64 32-byte key + version label for provider credentials |
| `CREDENTIAL_ENCRYPTION_KEY_PREVIOUS[_VERSION]` | Previous key kept readable during rotation |
| `AI_MOCK_PROVIDER_ENABLED` | Registers the offline mock provider (dev/CI) |
| `AI_PROVIDER_ENV_FALLBACK_ENABLED`, `ELEVENLABS_API_KEY` | Server-only ElevenLabs fallback for local development; never shown in the UI |
| `MAX_UPLOAD_BYTES`, `MAX_AUDIO_DURATION_MS` | Upload limits (defaults 200 MB / 30 min) |
| `EMAIL_TRANSPORT` | `console` (default) or `noop` |

Secrets are never exposed through `NEXT_PUBLIC_*`, API responses, logs (redacted), or browser storage.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server with inline worker |
| `pnpm worker` | Standalone job worker (production) |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` | Vitest unit + integration (uses `.env.test`, needs `dubbing_workspace_test` DB) |
| `pnpm test:e2e` | Playwright journeys against the seeded dev DB; run `pnpm build` first (starts `next start` on port 3200) |
| `pnpm db:migrate` / `db:deploy` / `db:seed` / `db:reset` / `db:studio` | Prisma helpers |

Running tests: `createdb dubbing_workspace_test`, copy `.env.test` values as needed (the file is git-ignored; see `tests/global-setup.ts`), then `pnpm test`.

## Architecture

```
src/app            routes: (auth) login/signup · onboarding · invite · (workspace) projects, segments review, my-assignments, notifications, settings · api/v1 handlers
src/components     ui (shadcn) · layout (AppShell, SidebarNav, NotificationBell) · dashboard · audio (player, waveform) · review · ai · imports
src/server         env · db (Prisma) · auth (better-auth) · authorization (policy + access) · services (domain logic, transactions, audit, outbox) · storage · queue · crypto · providers (elevenlabs, mock)
workers            job handlers (recording.process, ai.generate, outbox.dispatch, due-soon, cleanup) and the standalone worker entry
prisma             schema, migrations, seed
tests              unit · integration · e2e
```

Key behaviours:

- **Authorization** is enforced server-side on every API route and page via `requireProjectAccess` / `requireSegmentAccess`. Unauthorised resources return 404. Actors only see segments they are assigned to.
- **Review decisions** run in a transaction with an optimistic `Segment.revision` check (`expectedSegmentRevision`), write a `ReviewDecision`, an `AuditEvent`, an `OutboxEvent` and a notification. Stale decisions and concurrent reviewers are rejected with `STALE_REVISION`.
- **Uploads** go browser → signed URL → storage; the API verifies the object, enqueues `recording.process`; the worker validates bytes with ffprobe, extracts peaks, marks the version `READY`, moves the segment to `SUBMITTED` and notifies reviewers.
- **AI drafts** are queued jobs; the worker decrypts the credential server-side, calls the adapter, stores the audio, creates an `AI_GENERATED` recording version that re-enters the normal review pipeline. Output is never auto-approved. Quotas are per org/provider/month.
- **Imports** are previewed (parse → map → validate, stored as an `ImportBatch`) then committed atomically with `all` or `valid_only` semantics; segments with recordings or approvals are never overwritten.

## Deployment assumptions

- Run `pnpm build` and `pnpm start` behind HTTPS; set `INLINE_WORKER=false` and run at least one `pnpm worker`.
- Use managed PostgreSQL and an S3 bucket with no public ACLs. Provide `CREDENTIAL_ENCRYPTION_KEY` from a KMS-backed secret store.
- The in-memory rate limiter is per instance; put a shared limiter (e.g. Redis) in front when running multiple replicas.
- Email uses a console transport by default; implement `EmailTransport` for a real provider.

See `IMPLEMENTATION_STATUS.md` for scope coverage and known limitations.
