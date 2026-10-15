# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Gilayon (formerly "Himsog") is a clinic records system for an HMO clinic: verified check-in, priority queue, append-only consultations, PIN-signed prescriptions and certificates, offline outbox, encrypted backups. Next.js 16 App Router + PostgreSQL (Drizzle), with a React Router SPA mounted inside Next. `README.md` describes behaviour and demo accounts; `docs/REMAINING-WORK.md` is the status and open-items list.

## Commands

```bash
npm run dev          # next dev, http://localhost:3000 (embedded PGlite in ./.data, auto-seeded when empty)
npm run build        # next build (typechecks)
npm run typecheck    # tsc --noEmit
npm run lint         # oxlint src app db  (kept at 0 warnings; overrides live in .oxlintrc.json)
npm test             # vitest run, all of tests/*.test.ts
npx vitest run tests/idle.test.ts            # one file
npx vitest run tests/backend.test.ts -t "name"   # one test
npm run test:e2e     # Playwright: builds, serves on :3100 with a throwaway PGlite, drives Chromium (e2e/)
npm run admin -- create-doctor --name "Dr. X" --license 123   # first account on an empty database (db/admin.ts)
npm run db:generate  # drizzle-kit: new SQL migration after editing db/schema.ts
npm run db:seed      # load demo clinic into an empty DB (stop dev server first if embedded)
npm run start:https  # node server.mjs, TLS from the clinic CA (see README HTTPS section)
```

Migrations run automatically at startup (`src/server/db.ts`); never edit an applied migration, add a new one.

## Architecture

**One Next.js app, two halves.**
- `app/[[...slug]]/page.tsx` is a catch-all that mounts the old React Router SPA (`src/spa/Root.tsx`, `App.tsx`) client-side. Screens live in `src/features/{clinic,landing,auth,portal}`; there are no native Next page routes yet. `src/features/portal` is a localStorage prototype, separate from the clinic module.
- `app/api/*` are thin route files over `src/server/services/*` (records, queue, clinical, admin, merge, hrimport). Every handler goes through `route()` in `src/server/http.ts`, which does bearer-token auth, role check, zod validation, a DB transaction, and the SSE "changed" notification. Add endpoints through it, not by hand.

**Server state model.** The browser holds no patient records. `GET /api/state` (`src/server/state.ts`) returns one whole-clinic snapshot per role; `GET /api/events` (SSE, `src/server/events.ts`) tells every open screen to refetch. The client store `src/features/clinic/store/store.tsx` keeps that snapshot, overlays the offline outbox on top (`lib/outbox.ts`, IndexedDB, keyed by staff id), and flushes it through `POST /api/sync`, idempotent by client-generated op id. Page code uses the store's `ClinicApi` rather than calling `fetch`; the request helper is `lib/api.ts`.

**Integrity lives in the database.** Triggers (migration `0001_immutability.sql`) make signed prescriptions and documents immutable except for void, and consultations and `audit_log` append-only. Services write the audit row in the same transaction as the change (`audit()` in `src/server/core.ts`). Queue numbers and document numbers are issued server-side only. Duplicate patient merge is non-destructive (`patient.merged_into`); the snapshot folds records under the survivor, so reads of `data.patients` should go through the store's `patient()` helper.

**Auth** is its own: bearer token per browser tab (sessionStorage), sha256-hashed in the `session` table, bcrypt passwords and signing PINs, in-memory lockout, idle timeout enforced by heartbeat (`IDLE_MINUTES`). The server is deliberately single-process (event bus and lockout are in memory).

**Database drivers.** `DATABASE_URL` set means postgres-js against real PostgreSQL; unset means embedded PGlite at `PGLITE_DIR`. All tests run on PGlite (`PGLITE_DIR=memory://`), and real PostgreSQL has not been exercised yet.

**Ops code** is under `src/server/backup` (encrypted `.hbk` archives, nightly scheduler started from `instrumentation.ts`), `src/server/tls` (private CA, used by `server.mjs` and `db/https.ts`), `src/server/files.ts` (scans on disk in `UPLOADS_DIR`), and `deploy/windows/*.ps1` (never run on real Windows).

## Conventions that are easy to get wrong

- Tests share one process and DB: `vitest.config.ts` sets `fileParallelism: false`; each file sets `process.env.PGLITE_DIR = 'memory://'` before importing server code and seeds itself.
- Several identifiers still say `himsog` on purpose (`HIMSOG_AUTO_SEED`, `HIMSOG_ALLOW_RESET`, `HIMSOG_HOSTNAMES`, `certs/himsog-ca.*`, `himsog-*` storage keys, `himsog_*` trigger names; backups are now `gilayon-*.hbk` but old `himsog-*.hbk` are still read). Renaming them breaks running installs; do it only with a fallback that still reads the old name.
- Never commit `certs/`, `*.key`, `*.pem`, `.env`, `.data/`, `uploads/`, `backups/`, `*.hbk`, `*.csv`. `BACKUP_PASSPHRASE` must never be lost or logged.
- Demo scaffolding (seeded staff with `demo-password`, "Try the demo" chips, "synthetic demo data" footers) is still present and must be removed before real data; see `docs/REMAINING-WORK.md`.
- `.agents/`, `.claude/`, `.gstack/`, `.impeccable/` and `skills-lock.json` are agent tooling, not app code.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. PRs are merged by the user, not by Claude.
