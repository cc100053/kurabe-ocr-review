# Kurabe OCR Review

Internal dashboard for the Kurabe OCR closed-loop review (see
`docs/ocr_closed_loop_review.md` in the main app repo). Reads three Postgres
views on the Kurabe Supabase project via the **service_role** key (server-side
only) and is gated by Basic auth (`CONSOLE_PASSWORD`) plus Vercel Authentication.

## Pages

- `/` — the review queue: price-tag cards + per-photo receipt cards, served 20 at a time. Keys `1/2/3` ✓/✗/🤷, `J/K` move, `U` undo.
- `/products` — same-product photo-pair review.
- `/support` — in-app support replies.

See `CLAUDE.md` for architecture and the data contract.

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
| `CONSOLE_PASSWORD` | **secret**, Basic-auth password for the console |

## Deploy (Vercel)

Connected to GitHub → push to `master` deploys production, PRs get preview URLs.
Set the env vars in the Vercel project (Production + Preview).

## Security

`service_role` bypasses RLS, so this dashboard must never be public. Keep
`CONSOLE_PASSWORD` set (Basic auth on every route) and Vercel Deployment
Protection enabled. On localhost without `CONSOLE_PASSWORD` the OCR pages are
unprotected — only run `npm run dev` on a trusted machine.
