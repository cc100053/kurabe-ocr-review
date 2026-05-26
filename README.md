# Kurabe OCR Review

Internal dashboard for the Kurabe OCR closed-loop review (see
`docs/ocr_closed_loop_review.md` in the main app repo). Reads three Postgres
views on the Kurabe Supabase project via the **service_role** key (server-side
only) and is gated behind HTTP Basic auth.

## Pages

- `/confusion` — `scan_field_confusion_summary`: AI vs saved value per field, with an UPGRADE flag for pairs recurring ≥3× in 7 days.
- `/correction-samples` — `scan_field_correction_samples`: raw user-change events with guard context.
- `/suspicious` — `scan_field_suspicious_untouched`: risk-flagged but never corrected.

## Local dev

```bash
cp .env.example .env.local   # fill in SUPABASE_SERVICE_ROLE_KEY + REVIEW_BASIC_PASS
npm install
npm run dev                  # http://localhost:3000
```

## Env vars

| var | notes |
|---|---|
| `SUPABASE_URL` | `https://lgwdwfotnwfparvxqqnq.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret**, full DB access, server-only — never `NEXT_PUBLIC_` |
| `REVIEW_BASIC_USER` / `REVIEW_BASIC_PASS` | Basic-auth gate; if unset the site fails closed (503) |

## Deploy (Vercel)

Connected to GitHub → push to `main` deploys production, PRs get preview URLs.
Set the four env vars in the Vercel project (Production + Preview).

## Security

`service_role` bypasses RLS, so this dashboard must never be public. The Basic
auth middleware gates every route and fails closed when credentials are unset.
