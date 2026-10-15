# Feature review: gaps, unclear rules and weak spots

Reviewed 2026-10-15 on branch `feature-review-hardening` (from `main` at `f5a6d34`). It covers every feature in the README against the code: server services, route validation, the client store and the main screens. Items are marked **Fixed** (done on this branch, with tests) or **Open** (needs a decision or more work; a proposed fix is given for the front end and the back end).

Severity: **High** = patient safety, data loss or a security hole. **Medium** = wrong data can get in, or a rule exists only in the browser. **Low** = polish, scale or clarity.

---

## Fixed on this branch

| # | Sev | Area | What was wrong | What changed |
| --- | --- | --- | --- | --- |
| F1 | High | Signing | The 4-digit signing PIN had no lockout. Anyone using a doctor's open session could try all 10,000 PINs through `POST /api/documents/sign`. | 5 wrong PINs lock signing for 5 minutes (`assertPinUnlocked` / `notePinAttempt` in `src/server/auth.ts`, used by signing and PIN change). The lock is audited. Common PINs (`1234`, `0000`, …) can't be chosen as a *new* PIN. |
| F2 | High | Signing | Any doctor could sign, or edit, another doctor's draft. The signature line would have named the wrong author. | The server signs and edits only drafts whose `doctor_id` is the signer (403 otherwise). Signing is refused when the doctor has no PIN or no PRC license number. |
| F3 | High | Void / reissue | The server reissued any document, including a **signed, not voided** one, and could reissue one original more than once, so two valid prescriptions could exist for one visit. Only the UI prevented it. | Reissue needs a voided original that has not been replaced already (409 otherwise). Voiding twice gives a clear 409. The void reason must be at least a few words. |
| F4 | High | Offline | When `/api/sync` refused an offline entry, the browser **deleted it from the outbox**. The only trace was a toast showing the first reason. A doctor's offline note could vanish. | Refused entries stay in IndexedDB, marked `rejected`. A red banner on every clinic screen opens **Entries the server refused**: the reason, the full text, and *Copy text*, *Send again* and *Discard* (Discard asks for confirmation). `src/features/clinic/components/RejectedOutbox.tsx`. |
| F5 | High | Consultation | Typed notes lived only in React state. An idle sign-out (15 min), a reload or a click to another screen lost a half-written consultation. | The form autosaves to this tab's `sessionStorage`, keyed by doctor, patient and visit. It is restored with a "Restored the note you were writing at …" banner and *Start over*, and cleared on save. Closing the tab with an unsaved note asks first. |
| F6 | High | Accounts | `must_change_password` was enforced only by a browser overlay. Someone with a temporary password (often written on paper) had full API access and received the whole clinic snapshot. | `route()` refuses every endpoint except the password change and a **minimal snapshot** (own account only) until the person picks their own password. |
| F7 | Medium | Queue | A patient could be issued several queue numbers on one day and sit in two lanes. | One active ticket (waiting, called or in consultation) per patient per day; a second gives "already in today's queue as R-012". |
| F8 | Medium | Queue | `PATCH /api/queue/:id` let any role set any status: the desk could mark a patient *done* or *in consultation*, or move a finished ticket back to waiting. | An explicit list of allowed moves (`MOVES` in `src/server/services/queue.ts`). "Called" and "in consultation" come only from Call and Start. Moving a ticket out of consultation, or closing it by hand, is doctor-only. Earlier days can't be reopened. `startConsult` now checks the ticket, refuses a patient another doctor called, and is audited. |
| F9 | Medium | Queue | Tickets never seen stayed "waiting" forever after the day ended. | Earlier-day *waiting* and *called* tickets are closed as *left* (one system audit entry) when the next ticket is issued. *In consultation* is left alone because its note may still arrive. |
| F10 | Medium | Consultation | The server didn't check that `ticket_id` belonged to the patient, or that `correction_of` was the same patient's consultation. A second note on the same ticket hit the unique constraint, and offline it was then deleted (F4). | Ticket and correction are checked (400 on a mismatch). A ticket that already has a note is left unlinked and the note is still saved. |
| F11 | Medium | Labs | Any role could overwrite a lab result, and the old value was lost. | The first result can be entered by anyone. A correction is doctor-only, and the previous value goes into the audit detail ("Was: …"). |
| F12 | Medium | Validation | Birthdates were any string (`"abc"`, `2999-01-01`, `2026-02-30`), so the age, the senior lane and duplicate matching went wrong. No text field had a length limit. | Shared rules in `src/server/schemas.ts`: `IsoDate` (a real day), `Birthdate` (1900 to today), bounded notes and names, `rest_days` 0–365, quantity ≤ 1000, at most 30 drugs, 20 diagnoses and 30 labs. Applied to the patient, dependent, unlisted, scan, sync, draft, lab, allergy, family-history, flag and queue routes. |
| F13 | Medium | Check-in | Name verification removed every non a–z letter, so "Bañas" became "baas" and didn't match "Banas". Filipino names with ñ or accents falsely failed. | One shared `normName()` folds accents first (`helpers.ts`). The server and the browser now agree. |
| F14 | Medium | Records | Creating a dependent had no duplicate check and no retry protection: a double click or retry made two records. | Client-supplied id (a retry returns the same record) and the same likely-duplicate check as front-desk registration, passed only when the desk acknowledged the warning. Linking the same two people twice is refused. |
| F15 | Medium | Settings | The signature image accepted any `data:image/*`, including SVG, which can carry script and is drawn on every printed document. | PNG, JPG or WebP only, like the logo. |
| F16 | Low | Signing UI | Any signing failure that wasn't a network drop showed "Incorrect PIN", even "PIN locked" or "not your draft". | `signDocuments` returns the server's reason and the PIN pad shows it. |
| F17 | Low | Privacy | `GET /api/public/queue` (no sign-in) returned every ticket ever issued, a full history of daily visit volumes. | Today's tickets only. |

Tests: `tests/hardening.test.ts` (16 cases, including the temporary-password rule through the HTTP layer). All 143 unit and integration tests and all 11 end-to-end tests pass; `typecheck` and `lint` are clean. The e2e merge test now sends `confirmed: true` when it deliberately creates a duplicate dependent, as the form does after the warning.

---

## Open: needs a decision or more work

### O1 · High · Front desk and nurses receive every clinical note
`GET /api/state` sends the same records to every role. The desk and nurses get every consultation's treatment notes, diagnoses, prescriptions, certificates and lab results. The UI hides some of it, but it all sits in the browser's memory and DevTools. This is the main open Data Privacy Act issue (see "Data privacy review" in REMAINING-WORK).
- **Back end:** in `loadSnapshot`, for `desk` and `nurse` keep only visit metadata (date, service, doctor, ticket) and drop `treatment_notes`, `vitals`, `diagnoses`, prescription items, certificate findings and lab results. Return a `scope: 'front-desk'` flag.
- **Front end:** `PatientRecord` and `History` show "Visit on 12 Oct · Medical · Dr. Sollesta" for that scope. Print routes already sit behind `DoctorOnly`; check that `/print/summary` does too.
- **Decide first:** what a nurse may see (likely vitals and allergies, not notes).

### O2 · High · An allergy override is not recorded on the server
The allergy warning and its "I have checked" acknowledgement exist only in `Consult.tsx`. The server never checks a prescription against allergies, and the acknowledgement isn't stored, so after a reaction nobody can show the warning was seen.
- **Back end:** move `ALLERGY_CLASS` and the matching into `src/features/clinic/lib/` so both sides use it. Add `allergy_overrides: { drug, allergy, reason }[]` to `ConsultSchema`. In `saveConsultation`, refuse (409) a drug that matches a recorded allergy without an override, and write each override to the audit log.
- **Front end:** the acknowledgement checkbox becomes a short required reason ("tolerated before", "different class"), sent with the consultation.

### O3 · High · Allergies can't be corrected, and "no known allergies" can't be recorded
Allergies, family history and relative links are add-only: a wrong entry can't be removed or marked as entered in error. A patient with an empty list looks the same as one who was never asked.
- **Back end:** a migration adding `allergy.status` (`active` / `entered_in_error` / `resolved`) with `status_reason`, and `patient.allergies_reviewed_at/by`. Add `PATCH /api/patients/:id/allergies/:allergyId` (status and reason, audited, never deleted) and `POST /api/patients/:id/allergies/none` ("No known allergies"). Do the same for family history and for unlinking relatives.
- **Front end:** the consultation header shows **Allergies not asked yet**, **No known allergies (checked 3 Oct)**, or the list. Each allergy row gets a menu with *Entered in error* and *Resolved*.

### O4 · Medium · Nurses have no triage or vitals step
Nurses share the receptionist menu; vitals are typed only by the doctor during the consultation.
- **Back end:** `PUT /api/queue/:id/vitals` (nurse or doctor; stored as `jsonb` on `queue_ticket` via a migration; audited).
- **Front end:** a *Take vitals* button on the Queue board for nurses; Consult prefills from the ticket.
- **Decide:** whether the concept's "nurse = receptionist" still holds.

### O5 · Medium · Vitals are free text
`bp: "abc"` saves. Out-of-range values (temperature 49, pulse 400) give no warning.
- **Back end:** formats in `ConsultSchema` (BP `^\d{2,3}/\d{2,3}$`, temperature 30–45 °C, pulse 20–250, weight 0.5–400 kg).
- **Front end:** number inputs with units, plus an amber "check this value" hint outside the normal range (not a blocker).

### O6 · Medium · The browser decides identity verification on its own
`verify()` in the store computes the result locally and returns it at once; the server's answer, which writes the audit entry, is ignored. If the local copy is stale or the request fails, the desk sees "verified" while the audit log says "failed", or has no entry at all.
- **Front end:** await `POST /api/patients/verify` and show its `mismatches`. Keep the local check only as an instant preview.
- **Back end:** already returns `{ ok, mismatches, overridden }`; no change needed.

### O7 · Medium · Many actions are fire-and-forget
`completeRecord`, `addAllergy`, `addFamilyHistory`, `voidDocument`, `editDraft`, `addLabResult`, `markUrgent` and `setTicketStatus` are `void send(...)`. Buttons don't show progress, a double click sends twice (two allergy rows), and the screen can't react to a refusal except through a toast.
- **Front end:** return the promise from the store, disable the button while it's in flight, and close dialogs only on success.
- **Back end:** client-supplied ids for allergy and family-history rows (as for tickets and dependents), so a retry is harmless.

### O8 · Medium · Identity changes need no reason
The desk can change a patient's name, birthdate or sex with an optional reason. These fields drive verification, duplicate matching and the senior lane.
- **Back end:** in `completeRecord`, require a reason (≥ 5 characters) when `full_name`, `birthdate` or `sex` changes; consider doctor-only for `sex` and `birthdate` once the patient has a consultation.
- **Front end:** the edit form asks for the reason only when one of those fields changed.

### O9 · Low · Urgent flag has no reason
Any role can move someone to the top of the queue with no recorded reason.
- **Back end:** `POST /api/queue/:id/urgent` takes `reason` (required), written to the audit summary.
- **Front end:** a one-line prompt with quick picks ("difficulty breathing", "chest pain", "bleeding", "other").

### O10 · Low · Document numbers don't restart each year
The counters `rx` and `mc` are global, so `RX-2027-…` continues from 2026's last number. The numbers stay unique; the question is whether the clinic expects `RX-2027-000001`.
- **Back end:** counter key `rx:${year}`, with `floor` set to the highest existing number for that year, so the change can't reissue a number already used. **Decide** the format with the clinic first.

### O11 · Low · Sign-in hardening
The lockout is per account and in memory; there's no per-address limit, and an unknown account answers faster than a wrong password (no bcrypt compare).
- **Back end:** compare against a dummy hash when the account doesn't exist, and add a small per-IP counter beside the per-account one. Both stay in memory (single process, as today).

### O12 · Low · Request size limits
Route handlers call `req.json()` with no size cap; the body limits now come from the zod rules (F12) and the scan, logo and signature checks.
- **Back end:** reject `Content-Length` over about 4 MB in `route()` before parsing (scans are 2.5 MB of bytes, about 3.4 MB as base64).

### O13 · Low · Earlier-day "in consultation" tickets stay open
F9 deliberately leaves earlier-day *in consultation* tickets open.
- **Front end:** the Daily report and My queue list them as "Consultation started, no note yet", with *Write the note* and *Close without a note* (doctor).

---

## Not features, but worth knowing
- **Unmerging a chain:** when A was merged into B and B into C, A is re-pointed to C. Undoing the B → C merge brings back only B; A stays with C. This is documented in code, but staff should be told.
- **Reissued drafts belong to whoever reissued them.** With F2, only that doctor can sign the replacement. That is intended: the signer is the author of record.
- **The consultation autosave (F5)** keeps patient text in the tab's `sessionStorage` until it is saved or the tab closes, on the same terms as the offline outbox. If another person signs in on the same tab, they can't see it (it is keyed by doctor), but it is still on that PC until the tab closes.
