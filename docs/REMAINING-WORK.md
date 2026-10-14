# Remaining work

Status as of 2026-10-15, on `main` after `v1.0.0` and PRs #11, #19 and #20.

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
- [ ] **Remove demo scaffolding for production.**
  - The "Try the demo" chips and "Demo: fill from ID" button in `CheckIn.tsx`.
  - "synthetic demo data" in printed letterhead footers (`PrintPage.tsx`) and the landing page disclaimer.
  - The seeded demo staff and shared `demo-password`: create real accounts and deactivate the demo ones.
  - Keep `NEXT_PUBLIC_DEMO=0` and `HIMSOG_ALLOW_RESET` off on the real server.
- [ ] **Real letterhead and clinic details** (clinic name, address, logo, license numbers) on printed prescriptions, certificates and reports.
- [ ] **Data privacy review.** Retention, consent wording, who may see which records, and a way to answer access or correction requests under the Data Privacy Act. This is a policy decision first, and a feature second.
- [x] **Idle sign-out.** Done: screens sign out after `IDLE_MINUTES` (default 15) with no activity, enforced by the browser and by the server, and unsent offline entries are kept. Still to do: agree the right number of minutes with the clinic, and check it with staff who type long notes.
- [ ] **Run against a real PostgreSQL once.** Every automated test uses the embedded PGlite. The migrations, triggers and `DATABASE_URL` driver path are standard PostgreSQL, but they have not been exercised against a PostgreSQL server here.
- [ ] **Rotate and review secrets.** Set a strong `BACKUP_PASSPHRASE`, protect `certs/himsog-ca.key`, and keep `.env` out of backups shared off-site.

## 3. Engineering follow-ups

### Scale and robustness
- [ ] **`GET /api/state` sends the whole clinic** on every change. Fine for four PCs and a few hundred employees; it will need paging or incremental updates for a larger clinic or years of history.
- [ ] **The audit trail is capped at the latest 3,000 rows** in what the doctor's screen receives (`AUDIT_LIMIT` in `src/server/state.ts`). Older entries are in the database but not browsable or exportable from the screen. Add server-side paging and a full CSV export.
- [ ] **Single process.** The live-update bus (`src/server/events.ts`) and the login lockout counter are in memory, so only one server process is supported. That matches the clinic PC; revisit before any multi-process deployment.
- [ ] **Scans are included in full in every backup.** Size grows with the number of scans. Consider incremental or de-duplicated scan copies.
- [ ] **Offline cold start lands on the sign-in page** by design (records are not cached in the browser). Document this to staff, or consider a short-lived encrypted cache if the clinic wants it.

### Quality
- [ ] **Browser end-to-end tests.** The backend has 95 tests; the UI and the store's offline queue are only checked by hand. Add Playwright flows for check-in to signed prescription, void and reissue, offline sync, and merge.
- [ ] **Accessibility and large-text pass** with real senior staff (the concept asks for big text and buttons).
- [ ] **Filipino translations** are partial (`src/features/clinic/lib/i18n.ts`). Review and complete with a native speaker, including printed documents.
- [ ] **Content Security Policy.** Security headers are set (`next.config.ts`), but there is no CSP yet.
- [ ] **Dependency routine.** `npm audit` is clean today. Decide who reviews updates and how often.

### Cleanup
- [ ] **Finish the rename from Himsog to Gilayon.** The screens say Gilayon, but some identifiers still use the old name on purpose, because changing them would break running installs: `HIMSOG_AUTO_SEED`, `HIMSOG_ALLOW_RESET`, `HIMSOG_HOSTNAMES`, `certs/himsog-ca.*` (renaming would force every PC to trust a new CA), the `himsog-*` browser storage keys (renaming signs everyone out and can orphan unsent notes), the `himsog-` backup file prefix and the `himsog_*` trigger names in migration 0001. Rename each only with a fallback that still reads the old name.
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
