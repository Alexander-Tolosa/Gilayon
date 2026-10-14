# Recora · Digital Health Records (frontend)

Clickable prototype for the "Digitalization of Health Records" hackathon. It includes a landing page, sign-in with role selection, a patient portal, a front desk (secretary) workspace, and a doctor consultation workspace. All three portals read and write the same patient record.

## Run it

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

There is no backend yet. Data is seeded in `src/data/seed.ts` and persisted in the browser's `localStorage`, so changes made in one portal show up in the others. To start fresh, open **Switch portal → Reset demo data**.

## Demo accounts

Every sign-in form is pre-filled. Use **Switch portal** in the top bar to jump between roles during a demo.

| Portal | Who | Start at |
| --- | --- | --- |
| Patient | Andrea Villanueva (`andrea.v@mail.com` or `RC-10482`) | `/auth?role=patient` |
| Front desk | Joanna Reyes | `/auth?role=secretary` |
| Doctor | Dr. Miguel Santos (or any of 5 doctors) | `/auth?role=doctor` |

## Five-minute demo script

1. **Landing (`/`)**: explain the problem (paper charts) and the single shared record.
2. **New patient**: choose *Get started*, then *I'm a patient*, then *No, I'm new*. Fill in name, age, why you're consulting, history of disease and current medicines. A record is created with a Patient ID, and a consultation request goes to the front desk.
3. **Front desk**: on *Overview*, approve the new request and check in Andrea. Open *Patient inventory*, then a patient, to see labs, schedule and doctor in one place. The *Clinical notes* tab is locked by role-based access, and every attempt is logged.
4. **Doctor**: *Start consultation* on Andrea. Try to prescribe **Amoxicillin**: the penicillin allergy blocks it. Prescribe **Azithromycin** instead, accept the ophthalmology referral from the alerts, use *Draft from note*, then *Sign & complete*.
5. **Patient**: switch back to Andrea. The visit summary, the new prescription, the referral and the message from the doctor are all in her record. *Health record → Trends* shows 3 years of blood pressure, A1C and LDL.
6. **Reports**: in the front desk's *Population health*, filter "diabetic, no eye exam in 12 months" and send a reminder in one click.

## Feature map

| Area | Where |
| --- | --- |
| Centralized patient profiles | Patient inventory and patient chart (`/staff/patients`) |
| SOAP / DAP / follow-up templates | Doctor consultation |
| E-prescribing with allergy and interaction checks | Doctor consultation, `src/data/clinical.ts` |
| Lab and imaging orders and results | Consultation orders; *Labs & imaging* in the patient record |
| Longitudinal trends | Patient record → *Trends* |
| Preventive care alerts, protocols, risk warnings | Consultation side panel; patient *Health reminders* |
| Referrals and care coordination | Consultation → *Referral*; record timeline |
| Patient portal, self-scheduling, reminders | `/patient`, booking modal |
| Telehealth (uses the real camera for self-view) | `/patient/visit/:id`; doctor consultation for video visits |
| Secure messaging | Patient *Messages*; *Messages* tab in the staff chart |
| Billing, eligibility, coding assistance | `/staff/billing` |
| Task routing | `/staff/tasks` |
| Population health, operational dashboards, custom reports (CSV) | `/staff/reports` |
| RBAC, audit trail, compliance status | `/staff/security`; *Access log* tab in the chart |

## Stack

React 19, TypeScript, Vite, Tailwind CSS v4, Motion, React Router, Recharts, Phosphor Icons, Geist font. App routes are lazy-loaded, so the landing page doesn't download chart code.

```
src/
  data/        types, seed data, clinical rules (formulary, interactions, alerts)
  store/       shared state and actions, persisted to localStorage
  components/  UI kit, app shell, booking, chat, video call, charts
  pages/       Landing, auth, patient/, staff/, doctor/
```

All names, records and numbers are sample data. Don't enter real patient information.
