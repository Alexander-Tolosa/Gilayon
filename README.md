# Himsog · HMO-Clinic Digital Records

Clickable mockup screens for **Himsog**, Team KasCoders' entry to Hack Iloilo 2026. It covers the HMO-Clinic flow from the concept document: verified check-in, priority queue, patient registry, append-only consultations, e-signed prescriptions and medical certificates, void and reissue, a daily report, an audit trail, scans of old paper folders, and offline mode.

Himsog is a Next.js app with a PostgreSQL backend. The browser UI is a React Router app mounted inside Next.js; the API lives in `app/api/*`.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000, API at /api/*
npm run build      # type-check + production build
npm start          # serve the production build
npm run lint
npm test           # backend integration tests (embedded PostgreSQL, nothing to install)
```

With no configuration the server uses an embedded PostgreSQL (PGlite) in `./.data/` and fills it with the synthetic demo clinic on first start. For a real clinic server, copy `.env.example` to `.env` and set `DATABASE_URL` to a PostgreSQL database; migrations run automatically. `npm run db:seed` loads the demo data into an empty database (stop the dev server first when using the embedded one).

## Backend

| Concern | How it works |
| --- | --- |
| Source of truth | PostgreSQL schema in `db/schema.ts`, migrations in `db/migrations/`. Services in `src/server/services/`, one route file per endpoint in `app/api/`. |
| Sign-in | `POST /api/auth/login` returns a bearer token (kept per browser tab). Passwords and signing PINs are bcrypt hashes. Five wrong passwords lock the account for a minute. |
| Staff accounts | Doctors add staff, edit details, deactivate or reactivate (never delete), and set temporary passwords. A new or reset account must choose its own password at first sign-in. Everyone can change their own password. Deactivating or resetting signs the person out everywhere. The last active doctor can't be deactivated. |
| Roles | Doctor, nurse, receptionist. Calling patients, consulting, signing, voiding, reports, audit and settings are doctor-only and enforced on the server. |
| Queue numbers and document numbers | Issued only by the server, atomically, so two computers can never hand out the same one. |
| Signed records | Never edited. A database trigger rejects any change to a signed prescription or certificate other than voiding it with a reason. Consultations are append-only. |
| Audit log | Written in the same transaction as every change; the database refuses deletes. |
| Live screens | `GET /api/events` (Server-Sent Events) tells every open screen to refresh, including the public waiting screen (`/api/public/queue`, queue numbers only). |
| Offline | A tab that is offline queues consultations in the browser; `POST /api/sync` applies them once, even if the batch is sent twice. |

Not built yet: HTTPS certificate and Windows-service setup (deployment steps from the concept), scanned pages in object storage (they are stored in the database), and a multi-process event bus (the server is a single process, as on the clinic PC).

## Demo accounts

With `NEXT_PUBLIC_DEMO=1` (see `.env.example`) the demo password is pre-filled on `/clinic/login`; without it the field starts empty. **Every name, employee ID and record is synthetic.** Don't enter real patient data.

| Role | Who | Can do |
| --- | --- | --- |
| Front desk | Cristina Bañas, Joel Parreño | Check in, queue board, patient registry. Can't sign or edit consultation notes. |
| Doctor | Dr. Ramon Sollesta (Room 1), Dr. Liza Magbanua, Dr. Analyn Hechanova (Dental) | Call patients, consult, sign, void and reissue documents, daily report, audit trail, settings |
| Patient | No login | Waiting screen (`/waiting`) and printouts |

**Signing PIN for every doctor: `1234`** (it can be changed in Settings).

Demo anchors in the seed:
- **Maria Lourdes Villanueva** (IPG-2004-0318): returning patient with a Penicillin allergy, an old paper folder (F-2004-0181) with scanned pages, and her husband and daughter linked as dependents.
- **Jose Dela Cruz / Jose De la Cruz**: shows the duplicate-patient warning.
- **Carlo Sorongon** (IPG-2026-0071): a new hire with no record yet.

The seed is relative to the day it was created. To start over, go to **Settings → Reset demo data** (disabled on production builds unless `HIMSOG_ALLOW_RESET=1`).

## Five-minute demo script (concept §11)

1. **Check in** (front desk, `/clinic/checkin`): search `maria lurdes` (typos are fine). Verify name, birthdate and employee ID against the HR list, then try a wrong birthdate to see the check-in blocked. Mark her **Urgent**, then print the slip.
2. **Waiting screen** (`/waiting`, open it in a second window): the number shows up in the Urgent lane, ahead of Pregnant/PWD/Senior and Regular.
3. **Consult and sign** (doctor, *My queue*): *Call next patient*, apply a template, add **Amoxicillin**, and see the Penicillin allergy warning. Switch to another drug, add a medical certificate, then *Save and sign* with PIN `1234`. Print the prescription and certificate on letterhead.
4. **Void and reissue** (*Documents*): void the prescription with a reason, then reissue it. The new draft shows which document number it replaces.
5. **Offline**: click the status badge (top right) and choose **Offline**. Save a consultation; it is kept on this computer with a pending count. Switch back to **Online**, and it syncs.
6. **Report and audit**: *Daily report* (print it), then *Audit trail*, which lists every create, edit, sign and void.

## Routes

| Route | Screen |
| --- | --- |
| `/` | Landing page |
| `/clinic/login` | Staff sign-in (front desk or doctor) |
| `/clinic/checkin` | Verified check-in and new/returning patient (front desk) |
| `/clinic/queue` | Queue board by lane |
| `/clinic/patients`, `/clinic/patients/:id` | Registry with typo-tolerant search; patient record (family, old paper records, labs, history of changes) |
| `/clinic/doctor` | Doctor's queue (doctor only) |
| `/clinic/consult/:patientId` | One-screen consultation, Rx, labs, certificate, AI recap (doctor only) |
| `/clinic/documents` | Not yet signed / signed / voided (doctor only) |
| `/clinic/report` | Printable daily report (doctor only) |
| `/clinic/audit` | Audit trail with CSV export (doctor only) |
| `/clinic/settings` | Lane ranks, signature, PIN, staff (doctor only) |
| `/waiting` | Public waiting screen for the TV |
| `/print/:kind/:id` | Print views: `rx`, `mc`, `summary`, `ticket`, `report` |

## Concept checklist

| Concept item | Where |
| --- | --- |
| Verified check-in (name, birthdate, employee ID) | `/clinic/checkin` |
| Priority lanes: Urgent 1; Pregnant, PWD, Senior (60+, computed) 2; Regular 3; first come, first served within a lane | `src/features/clinic/lib/helpers.ts` (`rankTickets`), Settings |
| Live waiting list and waiting screen | `/clinic/queue`, `/waiting` |
| Registry, one-box search, linked relatives (MDR), family history | `/clinic/patients` |
| Append-only consultations, required fields, templates, duplicate warning | `/clinic/consult`, patient record |
| E-signed Rx (several drugs) and medical certificate, PIN + one tap, license and PTR, document number | Consult, `/print/rx`, `/print/mc` |
| Void with a reason, then reissue | `/clinic/documents` |
| Daily report, audit trail | `/clinic/report`, `/clinic/audit` |
| Scans of old paper records | Check-in and patient record → *Old paper records* |
| Offline badge on every screen (Online / Clinic network only / Offline) | Top bar of the clinic screens |
| English and Filipino labels | EN/FIL switch (clinic screens) |
| Patient summary printout | Patient record → *Print patient summary* |
| If time allows: allergy warning, lab requests and results, AI recap | Consult; patient record → *Labs* |

## What is simulated

- **Network mode**: the status badge simulates losing the connection for the demo. Sign-in token, network mode and the pending queue are per tab (`sessionStorage`); the records themselves are on the server.
- **Offline**: the status badge switches modes for the demo. Consultations saved offline are kept with pre-made ids, so syncing twice can't create duplicates. Signing and issuing queue numbers need the network.
- **AI recap**: a rule-based draft built from the patient's synthetic record, with links to its sources. No data leaves the browser.
- **PDFs**: print views use the browser's print dialog ("Save as PDF").
- **Install**: a PWA (`public/manifest.webmanifest`, `public/sw.js`). The service worker is registered only in production builds.

## Stack and libraries (hackathon disclosure)

React 19, TypeScript, Next.js 16, PostgreSQL (Drizzle ORM, PGlite for dev), Tailwind CSS v4, Motion (`motion/react`), React Router 7, Recharts, Phosphor Icons, Geist and Geist Mono fonts, Allura font (signature script), oxlint. App routes are lazy-loaded.

```
src/
  main.tsx, index.css
  app/                 App shell and routes
  shared/
    components/        UI kit, logo, charts, scroll effects
    lib/               utils, PWA service worker registration
  features/
    landing/           Landing page
    auth/              Sign-in page
    portal/            Patient/doctor portal: components, data, store
    clinic/            Himsog clinic module
      pages/           Route pages
      components/      Clinic-specific components
      data/            Seed data and reference tables
      lib/             Helpers and i18n
      store/           Clinic state
      types.ts
```

## Repository layout

`app/` Next.js routes and API, `src/` UI and server code, `db/` schema, migrations and seed, `tests/` backend tests, `public/` PWA assets. `.agents/`, `.claude/` and `skills-lock.json` are design-skill tooling for AI coding agents and are not part of the app.
