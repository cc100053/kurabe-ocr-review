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

## Product identity review

`/products` is protected by `CONSOLE_PASSWORD` and server-action authentication.
It shows product-pair photos, attributes and weekly Codex photo proposals; only
human reviewers can correct identity fields from each record's own original
photo, merge an evidenced pair or undo a decision. Names, prices and comparison
weights are retained; corrections invalidate stale assessments and append an audit.
Supabase schema/contracts live in the main app repository's
`docs/product_identity_review.md` and its product-identity migrations.
Run `npm run build` before publishing.

### Single-owner review

Product decisions, identity corrections and undo need no typed reviewer or rationale.
Authenticated server actions stamp `human` and explicitly record a manual action
without a written rationale; database conflict checks and before/after history remain.
Each record shows its own photo, saved name, price, tax entry mode, size, quantity,
category and shop. These are saved values, not guaranteed original AI output.
Historical price-tag telemetry lacks a verifiable record/photo link, so the page
labels original AI output unavailable rather than matching by name or timestamp.
Series/size relationships and cross-size comparison remain deferred to the main
app repo's `docs/product_series_plan.md`.

Run `node --test test/productReview.test.ts` and `npm run build` before publishing.
