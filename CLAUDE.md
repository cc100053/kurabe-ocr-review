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
node --test test/*.test.ts   # pure-helper tests (Node ≥ 22.18 strips TS types)
```

## Architecture

- All pages are `export const dynamic = "force-dynamic"` — the dashboard reads live data every request, never statically cached.
- `lib/supabase.ts` — `getSupabaseAdmin()` builds a **service_role** client lazily and is marked `import "server-only"`. It must never be imported into a client component.
- **Client-safe vs server-only modules.** `app/page.tsx` is a server component but the review surface is interactive (keyboard + inline verdicts), so `app/ReviewBoard.tsx` and the cards are **client** components. A client component must not transitively import `lib/supabase`. So the pure types/helpers live in server-free modules — `lib/verdict.ts` (`Verdict`, `noteKey`, `verdictFromNote`, …) and `lib/display.ts` (`QueueItem`, `fieldLabel`, `riskReasons`, `receiptFieldLabel`, …) — and the data-fetching modules (`lib/notes.ts`, `lib/queries.ts`, `lib/receiptQueries.ts`) import + **re-export** them so server pages can keep importing from one place. Rule: client components import pure stuff from `@/lib/verdict` / `@/lib/display`; use `import type` for types from the server-only modules.
- `lib/queries.ts` reads the admin-only `scan_review_queue`: one latest successful-save event supplies every card’s values, tax mode/rate, photo, provenance and `event_id`. AI-null fills and independent flagged fields stay reviewable. Prices are pre-discount inputs; the app stores a discounted tax-included total. Tax conflicts always need a human verdict; arithmetic alone never resolves a card.
- `lib/supabase.ts` also exports `selectAll()`: PostgREST caps responses at 1000 rows, so any unbounded read (notes, the queue feeds) pages through it.
- `lib/notes.ts` and `app/actions.ts` bind notes to `event_id`. Verdicts use service-role-only `review_scan_event`; line verdict, blamed fields and category-memory changes commit together. `review_receipt_rest` rejects stale/conflicting or memory-candidate batches atomically. The board updates only after success and exposes retryable failures. `clearQueue` retains its viewing-cutoff semantics.
- **Receipt category memory**: the atomic review RPC validates the scan/event, derives candidacy from stored telemetry and calls `approve_receipt_category_memory` for individual ✓ only. Wrong-category decisions exclude the source; undo/🤷 remove only human memory rows. Bulk confirmation never approves memory. See the app’s `docs/receipt_category_memory.md`.
- `app/ReviewBoard.tsx` owns pending/error state and keyboard focus. `onFocusCapture` synchronizes Tab focus with 1/2/3 verdict targets. A completed batch requires acknowledged persistence. Notes from another save event do not resolve the current card; legacy `original_price` notes are normalized without carrying them onto later saves.
- `app/QueueCard.tsx` + `app/VerdictButtons.tsx` — presentational price-tag card + verdict buttons (driven by the board).
- `app/ReceiptCard.tsx` — image-backed receipt card: one receipt photo + its parsed lines, per-line verdict + "其餘全部 ✓" (assume-good, flag-exceptions). A line's verdict id is its per-line `scan_id` with `field="line"`.
- `lib/receiptQueries.ts` — reads the receipt-scan review views; `getReceiptReviewGroups(since)` groups `receipt_line_review` rows by base `scan_id` into per-photo cards, keeping only lines that need a human eye (`lib/batch.ts` `needsHumanEye`: edited, memory-prefilled, category-corrected or low/medium confidence; the rest count as `skipped`).
- `lib/batch.ts` — `takeBatch()` serves 待審 one sitting (20 units) at a time: receipts up to half (whole receipts may exceed 20), price cards the rest, memory-candidate receipts first.
- Pages: `app/page.tsx` (the review queue — the human-facing surface; price-tag cards + receipt cards, with a 來源 全部/價牌/收據 toggle), `app/products/page.tsx` (same-product photo-pair review, see app doc `docs/product_identity_review.md`), `app/support/page.tsx` (in-app support replies). `app/stats/page.tsx` and `app/receipt/page.tsx` are statistics for AI and are **not in the nav**; AI should read the views directly.

### Design intent

The human's only irreducible job is **eyeballing a scan image and judging whether the AI's value is right**. So the queue (`/`) is image-forward with one-tap verdicts, high-risk first, defaulting to "待審", and is keyboard-driven for volume (1/2/3 verdict, J/K move, U undo) with inline verdicts (no page reload). 待審 is served in batches of 20 ("下一批 →" when done) and receipts show only uncertain lines, so a sitting takes minutes, not an afternoon. It covers **both** streams:

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
- `receipt_line_review` — latest successful event per receipt line, including its photo, AI/saved fields, `event_id`, `category_corrected` and `category_memory_applied`. Conflicting owners are withheld. Keep this view SECURITY INVOKER and service-role-only.
- `approve_receipt_category_memory(p_event_id, p_note)` — service-role-only RPC (same migration) that writes the event-bound category-memory approval.

Deploy app migration `20261026074134_ocr_review_consistency.sql` before deploying the
matching dashboard code; old mobile RPCs remain unchanged. If you change a view's columns, update the
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
| `CONSOLE_PASSWORD` | **secret**, Basic-auth password for the whole console (required for `/support`, `/products`) |

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
so this dashboard must never be publicly reachable. `middleware.ts` enforces
**Basic auth with `CONSOLE_PASSWORD`** on every route once it is set; without it,
`/support` and `/products` fail closed (503) while the OCR pages fall back to
**Vercel Authentication** (Deployment Protection) alone — keep both. Server
actions on `/products` re-check the password (`requireIdentityReviewer`). The
service_role key lives only in Vercel env / `.env.local`, never in code or any
client bundle.
