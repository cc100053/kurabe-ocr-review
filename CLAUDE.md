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
- **Client-safe vs server-only modules.** `app/page.tsx` is a server component but the review surface is interactive (keyboard + inline verdicts), so `app/ReviewBoard.tsx` and the cards are **client** components. A client component must not transitively import `lib/supabase`. So the pure types/helpers live in server-free modules — `lib/verdict.ts` (`Verdict`, `noteKey`, `verdictFromNote`, …) and `lib/display.ts` (`QueueItem`, `fieldLabel`, `riskReasons`, `receiptFieldLabel`, …) — and the data-fetching modules (`lib/notes.ts`, `lib/queries.ts`, `lib/receiptQueries.ts`) import + **re-export** them so server pages can keep importing from one place. Rule: client components import pure stuff from `@/lib/verdict` / `@/lib/display`; use `import type` for types from the server-only modules.
- `lib/queries.ts` — reads the price-tag review views; re-exports `lib/display`.
- `lib/notes.ts` + `app/actions.ts` — read/write `scan_review_notes`. Verdict actions are called straight from the client board (no `<form>`, no reload) and **don't revalidate** — the board reflects them optimistically and keeps cards in place for fast keyboard review; a real refetch happens on the next navigation (pages are force-dynamic). `setVerdict(scanId, field, verdict)` maps ✓correct→`wontfix`, ✗wrong→`triaged`, 🤷cannot_tell→`wontfix`+`root_cause=ocr`, stamps `reviewed_by="human"`. `clearVerdict` (undo) deletes only the human note; `confirmReceiptRest` bulk-marks a receipt's remaining lines correct. `clearQueue` is the one action that still revalidates.
- `app/ReviewBoard.tsx` (client) — owns keyboard focus across every reviewable unit (price cards + receipt lines), the live verdict overlay, and the server-action calls. Keys: `1/2/3`=✓/✗/🤷 on the focused unit (then advance), `J/K` or `↓/↑` move, `U` undo.
- `app/QueueCard.tsx` + `app/VerdictButtons.tsx` — presentational price-tag card + verdict buttons (driven by the board).
- `app/ReceiptCard.tsx` — image-backed receipt card: one receipt photo + its parsed lines, per-line verdict + "其餘全部 ✓" (assume-good, flag-exceptions). A line's verdict id is its per-line `scan_id` with `field="line"`.
- `lib/receiptQueries.ts` — reads the receipt-scan review views; `getReceiptReviewGroups()` groups `receipt_line_review` rows by base `scan_id` into per-photo cards.
- Pages: `app/page.tsx` (the review queue — the human-facing surface; price-tag cards + receipt cards, with a 來源 全部/價牌/收據 toggle), `app/stats/page.tsx` (price-tag big-picture, mostly for AI), and `app/receipt/page.tsx` (receipt-scan **stats only**, for AI — per-photo human review now lives on `/`).

### Design intent

The human's only irreducible job is **eyeballing a scan image and judging whether the AI's value is right**. So the queue (`/`) is image-forward with one-tap verdicts, high-risk first, defaulting to "待審", and is keyboard-driven for volume (1/2/3 verdict, J/K move, U undo) with inline verdicts (no page reload). It covers **both** streams:

- **Price tag** — merges `scan_field_suspicious_untouched` (flagged, never corrected → maybe silently wrong) and `scan_field_correction_samples` (user overrode AI) into per-tag cards.
- **Receipt** — one receipt uploads one shared photo, so the review unit is the receipt: `getReceiptReviewGroups()` shows that photo + every saved line, and the reviewer flags wrong lines against it ("其餘全部 ✓" confirms the rest). Image-backed because the photo (+ store name + per-line confidence) now rides along in the `receipt_record_saved` telemetry.

Everything statistical (correction rates, recurring patterns, guard reasons) is left for AI to read off the views directly; only a slim glance lives on `/stats` (price tag) and `/receipt` (receipt). Keep new UI minimal: show only what a human needs to adjudicate.

### Data it reads (defined in the APP repo, not here)

The Postgres views and the `scan_review_notes` table are created by migrations in
the **main Kurabe repo** (`/Users/fatboy/kurabe/supabase/migrations/`), not in
this repo. This repo only consumes them:

- `scan_field_correction_overview` — per-field correction rate + 7d/30d windows.
- `scan_field_confusion_summary` — recurring AI→saved pairs with `count_7d`/`count_30d`.
- `scan_field_correction_samples` — raw `scan_field_user_changed` events.
- `scan_field_suspicious_untouched` — risk-flagged but uncorrected, with `evidence_text`.
- `scan_review_notes` — triage status/root_cause/PR link/note per `scan_id+field`.
- `receipt_field_confusion_summary` — receipt-scan AI→saved pairs per field (category/name/price/tax_basis), with `corrected_count`/`correction_rate`.
- `receipt_field_correction_samples` — receipt lines the user edited; each field stored as a `{ai, saved}` json object plus a `changed_fields` flag map.
- `receipt_line_review` — EVERY saved receipt line (not just edited), each field as `{ai, saved}` + `changed_fields`, plus the shared `image_url` / `store_name` / `confidence`. Backs the per-photo human review cards on `/`. (`image_url`/`store_name`/`confidence` are null for events from app versions before they were added to the `receipt_record_saved` payload.)

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
