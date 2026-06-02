# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

`kurabe-ocr-review` is the **internal review dashboard** for the Kurabe app's OCR
closed-loop quality workflow. It is a **separate repo** from the Flutter app
(which lives at `/Users/fatboy/kurabe`). It reads OCR telemetry review views
from the Kurabe Supabase project and lets a reviewer triage cases.

- Deployed: **https://kurabe-ocr-review.vercel.app** (Vercel project `rexs-projects-6b1bf957/kurabe-ocr-review`).
- GitHub: `cc100053/kurabe-ocr-review` (**public** — see Security below).
- The end-to-end plan/status lives in the app repo: `/Users/fatboy/kurabe/docs/ocr_closed_loop_review.md`.

## Stack & commands

Next.js 15 App Router + TypeScript, `@supabase/supabase-js`, npm (no pnpm).

```bash
cp .env.example .env.local   # fill SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev                  # http://localhost:3000 (no auth on localhost)
npm run build                # must pass before pushing
```

## Architecture

- All pages are `export const dynamic = "force-dynamic"` — the dashboard reads live data every request, never statically cached.
- `lib/supabase.ts` — `getSupabaseAdmin()` builds a **service_role** client lazily and is marked `import "server-only"`. It must never be imported into a client component.
- `lib/queries.ts` — reads the review views (see below).
- `lib/notes.ts` + `app/actions.ts` — read/write `scan_review_notes`. The human verdict is one-tap: `setVerdict` (a server action from a plain `<form action={...}>`, no client JS) maps ✓correct→`wontfix`, ✗wrong→`triaged`, 🤷cannot_tell→`wontfix`+`root_cause=ocr`, and stamps `reviewed_by="human"` to distinguish eyeball verdicts from AI/skill notes. `verdictFromNote()` maps a note back to the verdict.
- `app/QueueCard.tsx` + `app/VerdictButtons.tsx` — server components: the image-forward review card and its verdict buttons.
- Pages: `app/page.tsx` (the review queue — the only human-facing surface) and `app/stats/page.tsx` (compact big-picture: which field is worst + recurring errors; mostly for AI to read).

### Design intent

The human's only irreducible job is **eyeballing a scan image and judging whether the AI's value is right**. So the queue (`/`) merges the two views that need eyes — `scan_field_suspicious_untouched` (flagged, never corrected → maybe silently wrong) and `scan_field_correction_samples` (user overrode AI) — into image-forward cards with one-tap verdicts, high-risk first, defaulting to the "待審 / unreviewed" filter. Everything statistical (correction rates, recurring patterns, guard reasons) is left for AI to read off the views directly; only a slim glance lives on `/stats`. Keep new UI minimal: show only what a human needs to adjudicate.

### Data it reads (defined in the APP repo, not here)

The Postgres views and the `scan_review_notes` table are created by migrations in
the **main Kurabe repo** (`/Users/fatboy/kurabe/supabase/migrations/`), not in
this repo. This repo only consumes them:

- `scan_field_correction_overview` — per-field correction rate + 7d/30d windows.
- `scan_field_confusion_summary` — recurring AI→saved pairs with `count_7d`/`count_30d`.
- `scan_field_correction_samples` — raw `scan_field_user_changed` events.
- `scan_field_suspicious_untouched` — risk-flagged but uncorrected, with `evidence_text`.
- `scan_review_notes` — triage status/root_cause/PR link/note per `scan_id+field`.

If you change a view's columns, that migration happens in the app repo; update the
matching types/queries here in the same change.

## Supabase project

Reads the Kurabe project **`lgwdwfotnwfparvxqqnq`** (NOT the PETS project
`ilxzpszgirhwxpeocygs` in the same org). `SUPABASE_URL` =
`https://lgwdwfotnwfparvxqqnq.supabase.co`. Schema migrations belong in the app
repo — verify the project ID before running any DB migration there.

## Env vars

| var | notes |
|---|---|
| `SUPABASE_URL` | `https://lgwdwfotnwfparvxqqnq.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret**, full DB access, server-only — never `NEXT_PUBLIC_` |

Set in the Vercel project (Production + Preview). Locally use `.env.local` (gitignored).

## Deploy

Git-connected: **push to `master` → Vercel auto-deploys production**; PRs get preview URLs.

- The repo must stay **public**: on the Hobby plan, private repos block git
  deploys when the commit author isn't the Vercel-linked identity (we hit
  "Blocked" deployments). There are no secrets in the code, so public is fine.
- The Vercel CLI in some sandboxes fails status polling with `EADDRNOTAVAIL`;
  confirm deploy status in the Vercel dashboard rather than CLI polling.

## Security

`service_role` bypasses RLS (the `scan_telemetry_events` table is `select_own`),
so this dashboard must never be publicly reachable. Access is gated by **Vercel
Authentication** (Settings → Deployment Protection) — keep it enabled; there is
no app-level auth. The service_role key lives only in Vercel env / `.env.local`,
never in code or any client bundle.
