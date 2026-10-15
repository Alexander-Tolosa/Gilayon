# Remaining work

Status as of 2026-10-15, on `main` after `v1.0.0`, PRs #11, #19, #20, #27 and #29, and the letterhead, audit export, first-doctor, demo-mode, CSP and end-to-end work.

Gilayon does what the concept describes end to end: verified check-in and priority queue, patient registry with duplicate merge, append-only consultations, PIN-signed prescriptions and certificates with void and reissue, staff accounts, scanned pages on disk, an offline outbox with automatic sync, encrypted nightly backups with restore, HTTPS with a private clinic CA, an audit trail with a per-doctor unseen feed, and a daily report with census.

What is left falls into three groups: things that can only be checked on the clinic's own hardware, things that must change before real patient data goes in, and engineering follow-ups. Items are in priority order within each group.

---

## 1. Needs the clinic's hardware or people (cannot be finished from the code)

- [ ] **Run the Windows scripts on the real server PC.** `deploy/windows/install-service.ps1`, `uninstall-service.ps1` and `trust-ca.ps1` were written carefully but have never run on Windows. Check with `Get-ScheduledTaskInfo -TaskName "Gilayon Server"`, then reboot the PC and confirm the app comes back by itself.
- [ ] **Install the clinic CA on one real clinic PC** and confirm Edge/Chrome show a clean padlock, the app installs as a PWA, and offline mode works. Then repeat for Firefox (manual import) and a phone or tablet.
- [ ] **Make a backup to the real USB drive**, unplug the drive and confirm Settings shows the failure, plug it back and confirm recovery. Confirm the off-site folder receives its copy.
- [ ] **Do a trial restore** on a spare folder or PC with `npm run backup:restore`, and open the result. Repeat monthly. Decide who keeps the `BACKUP_PASSPHRASE` and where the second copy lives.
- [ ] **Run PostgreSQL as a Windows service** on the server PC and point `DATABASE_URL` at it. Write down the install steps used (there is no Postgres install guide yet).
- [ ] **Staff trial of duplicate merge** on real records. Matching is exact birthdate and sex plus a similar name. Note false positives and misses.
- [ ] **Staff trial of the whole flow** with the front desk, nurse and doctor on separate PCs, including a deliberate unplugged-network test.
- [ ] **Agree the decisions the concept left open**, then record them in the README:
  - Priority ranks per lane (the current ranks are the team's suggestion).
  - Whether the census should count visits, patients, or both (both are shown today).
  - How long paper folders are kept after scanning.
  - The doctor's signature and PIN policy.

## 2. Before real patient data goes in

- [x] **HR employee list import screen.** Done: Settings > Import HR list (CSV, column matching, preview, validation, conflicts, duplicates hand-off). Still to do with real data: try it on the clinic's actual export, and add `.xlsx` support only if CSV export proves awkward for HR.
- [x] **Demo scaffolding is off on a real server.** Done: the demo helpers ("Try the demo" searches, "Demo: fill from ID", the filled-in demo password, "synthetic demo data" on prints, Reset demo data) show only on the demo server, meaning the embedded database with auto-seeding (`isDemoServer()` in `src/server/env.ts`; `NEXT_PUBLIC_DEMO=1`/`0` overrides). `npm run admin -- disable-demo` deactivates the seeded demo accounts once a real doctor exists. Still to do: the public landing page keeps its hackathon "synthetic data" disclaimer until the clinic decides what the public page should say.
- [x] **Real letterhead and clinic details.** Done: **Settings → Clinic letterhead** (doctor) sets the clinic name, header line, office, address, contact, license or accreditation number and logo, printed on prescriptions, certificates, summaries, reports and queue slips. Still to do: enter the clinic's real details.
- [ ] **Data privacy review.** Retention, consent wording, who may see which records, and a way to answer access or correction requests under the Data Privacy Act. This is a policy decision first, and a feature second.
- [x] **Idle sign-out.** Done: screens sign out after `IDLE_MINUTES` (default 15) with no activity, enforced by the browser and by the server, and unsent offline entries are kept. Still to do: agree the right number of minutes with the clinic, and check it with staff who type long notes.
- [x] **First doctor on an empty database.** Done: `npm run admin -- create-doctor --name ... --license ...` creates the first doctor (temporary password, must change it at first sign-in); refused once an active doctor exists. See README, "Setting up a real clinic server".
- [ ] **Run against a real PostgreSQL once.** Every automated test uses the embedded PGlite. The migrations, triggers and `DATABASE_URL` driver path are standard PostgreSQL, but they have not been exercised against a PostgreSQL server here.
- [ ] **Rotate and review secrets.** Set a strong `BACKUP_PASSPHRASE`, protect `certs/himsog-ca.key`, and keep `.env` out of backups shared off-site.

## 3. Engineering follow-ups

### Scale and robustness
- [ ] **`GET /api/state` sends the whole clinic** on every change. Fine for four PCs and a few hundred employees; it will need paging or incremental updates for a larger clinic or years of history.
- [x] **Audit paging and full export.** Done: the snapshot still carries the newest 3,000 rows (`AUDIT_LIMIT`), and the Audit trail pages further back from `GET /api/audit` (cursor on time and id, no gaps or repeats) and exports the whole log with `POST /api/audit/export` (CSV, formula-safe, the export itself is logged). Filters apply to the entries loaded so far.
- [ ] **Single process.** The live-update bus (`src/server/events.ts`) and the login lockout counter are in memory, so only one server process is supported. That matches the clinic PC; revisit before any multi-process deployment.
- [ ] **Scans are included in full in every backup.** Size grows with the number of scans. Consider incremental or de-duplicated scan copies.
- [ ] **Offline cold start lands on the sign-in page** by design (records are not cached in the browser). Document this to staff, or consider a short-lived encrypted cache if the clinic wants it.

### Quality
- [x] **Browser end-to-end tests.** Done: `npm run test:e2e` (Playwright, `e2e/clinic.spec.ts`) builds the app, serves it on :3100 with a throwaway database, and covers the public pages, check-in to a queue number, the nurse/receptionist menu, a PIN-signed consultation, an offline note syncing on reconnect, and the letterhead and audit export. Still to add: void and reissue, and duplicate merge.
- [ ] **Accessibility and large-text pass** with real senior staff (the concept asks for big text and buttons). Every clinic screen now has an A / A+ / A++ text-size switch (remembered per PC); the pass with staff is still to do.
- [ ] **Filipino translations** are partial (`src/features/clinic/lib/i18n.ts`). Review and complete with a native speaker, including printed documents.
- [x] **Content Security Policy.** Done in `next.config.ts`: scripts, styles, fonts and API calls only from the server itself, no framing, no plugins. Next.js needs `'unsafe-inline'` for its start-up scripts; a nonce-based policy would remove that and is a possible next step.
- [x] **Dependency routine.** Done: Dependabot opens a grouped npm update every Monday plus security fixes; `npm run deps:check` shows outdated packages and audit results. Still to do: name the person who reviews and merges them.

### Cleanup
- [ ] **Finish the rename from Himsog to Gilayon.** The settings now read `GILAYON_AUTO_SEED`, `GILAYON_ALLOW_RESET` and `GILAYON_HOSTNAMES`, falling back to the old `HIMSOG_*` names. Still on the old name on purpose, because changing them would break running installs: `certs/himsog-ca.*` (renaming would force every PC to trust a new CA), the `himsog-*` browser storage keys (renaming signs everyone out and can orphan unsent notes), the `himsog-` backup file prefix and the `himsog_*` trigger names in migration 0001. Rename each only with a fallback that still reads the old name.
- [ ] **`audit_log.read_at` is unused.** Seen-tracking uses a per-doctor mark in `meta` instead. Drop the column in a migration (the backup format and seed insert both mention it) or document it as reserved.
- [ ] **The SPA is mounted as one Next.js catch-all** (`app/[[...slug]]`). It works, but moving screens to native Next routes would give per-route code splitting and server rendering of the public landing page.
- [ ] **The AI recap is rule-based**, built from the patient's own record with links to sources. Any real model integration needs its own privacy decision first.
- [ ] **Patient portal feature** (`src/features/portal`) is still a localStorage prototype with no backend, separate from the clinic module.

---

## Known limits (by design, not defects)

- Signing, queue numbers and whole-database search need the server; only notes, draft edits and photos work offline.
- Merging patients never moves or deletes history, so signed documents keep the record they were issued under. Fields are not auto-copied between merged records; staff edit the survivor.
- Backups are encrypted with one passphrase. If it is lost, the backups cannot be opened and nothing can recover them.
- The clinic CA key can impersonate the server to every PC that trusts the CA. Keep it on the server only.
