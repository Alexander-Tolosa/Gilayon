# Gilayon · Himsog

HMO-Clinic digital records, built by Team KasCoders for Hack Iloilo 2026. Himsog covers verified check-in, a priority queue, a patient registry, append-only consultations, e-signed prescriptions and medical certificates, void and reissue, a daily report, an audit trail, and offline mode.

## Repository layout

| Path | What it is |
| --- | --- |
| `frontend/` | React + TypeScript + Vite app. Runs standalone and simulates the backend in the browser. See [`frontend/README.md`](frontend/README.md) for routes, demo accounts and the demo script. |
| `.agents/`, `.claude/`, `skills-lock.json` | Design-skill tooling for AI coding agents. Not part of the app. |

There is no backend yet. When it is added, it will get its own top-level folder (or a framework folder such as `supabase/` or `convex/`), and this table will be updated.

## Quick start

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

All patient names, employee IDs and records are synthetic. Don't enter real patient data.
