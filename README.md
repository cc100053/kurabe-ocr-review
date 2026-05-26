# Kurabe OCR Review

Internal dashboard for the Kurabe OCR closed-loop review (see
`docs/ocr_closed_loop_review.md` in the main app repo). Reads three Postgres
views on the Kurabe Supabase project via the **service_role** key (server-side
only) and is gated behind **Vercel Authentication** (Deployment Protection).

## Pages

- `/confusion` — `scan_field_confusion_summary`: AI vs saved value per field, with an UPGRADE flag for pairs recurring ≥3× in 7 days.
- `/correction-samples` — `scan_field_correction_samples`: raw user-change events with guard context.
- `/suspicious` — `scan_field_suspicious_untouched`: risk-flagged but never corrected.

## Local dev

```bash
cp .env.example .env.local   # fill in SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev                  # http://localhost:3000 (no auth on localhost)
```

## Env vars

| var | notes |
|---|---|
| `SUPABASE_URL` | `https://lgwdwfotnwfparvxqqnq.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret**, full DB access, server-only — never `NEXT_PUBLIC_` |

## Deploy (Vercel)

Connected to GitHub → push to `master` deploys production, PRs get preview URLs.
Set the two env vars in the Vercel project (Production + Preview).

## Security

`service_role` bypasses RLS, so this dashboard must never be public. Access is
gated by **Vercel Authentication** (Settings → Deployment Protection): only
members of the Vercel team who are logged in can reach any deployment. There is
no app-level auth, so keep Deployment Protection enabled. On localhost the app
is unprotected — only run `npm run dev` on a trusted machine.
