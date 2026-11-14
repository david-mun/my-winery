# My Wine List — Codex repository instructions

## Product and scope
Build a mobile-first, responsive private wine cellar and purchase-history PWA for <=10 invited users using Next.js App Router, TypeScript, Tailwind/shadcn-ui, Supabase Auth/PostgreSQL/Storage and Vercel.

## Sources of truth (read only when relevant)
- `docs/architecture.md`: UX, flows, schema concepts, functional acceptance criteria.
- `database/schema_design_v1.sql`: **UNTESTED DESIGN DRAFT**; review/repair and convert to versioned Supabase migrations and RLS tests before applying.
- `data/*.csv` + `data/source_manifest.json`: migration snapshot and reconciliation oracle. Do not edit the original snapshot.
- `codex/START_PROMPT.md`: initial implementation goals and stage gates.

## Immutable business rules
- Default privacy is **per-user private collections**, not shared global wine collections. An admin manages user access, not users' private wine data by default.
- One wine master card can have many purchases; store receipts and line items separately. Duplicate name must not multiply wine cards.
- For Sep 2026 purchase, two wine bottles share ONE 39,900 KRW bundle. Unknown per-bottle allocation stays NULL.
- For Oct 2026, 18,000 KRW discounts are at receipt level and must NOT be silently allocated to bottles.
- Real paid total = 293,900 KRW, 2 receipts, 10 distinct wines, 12 purchased bottles/rows. Migration must be idempotent.
- Explicit vintage NV is distinct from UNKNOWN. No fabricated tasting date, no fabricated Vivino score/real-time sync.
- External Vivino links are references; don't scrape protected data or copy unlicensed pictures.

## Authentication / security
- Invite-only Supabase Auth; no open self-registration in production.
- Enforce owner isolation with DB RLS plus server-side checks. Do not rely on hiding UI buttons.
- Admin invitation / deactivation / role changes only in secure server-side code using admin-authorized credentials. Keep service-role keys server-only, never NEXT_PUBLIC or client bundles.
- Do not allow deactivating/removing the last active admin. Admin data access is not automatically cross-tenant content access.
- Supabase private Storage: signed read URLs or authenticated reads; validate file size and MIME (and signature where possible), image strip EXIF; no uncontrolled public receipt URLs.
- Credentials must be provided locally or in deployment secret configuration, never checked in or printed.

## Implementation norms
- Prefer a lean working MVP over speculative architectural complexity. Use maintained compatible package versions, strict TypeScript, server rendering where helpful, accessible Korean UI, semantic HTML, keyboard access and touch targets >=44px.
- Treat screenshots or illustrations from Vivino only as design inspiration. Create original visuals and use user-owned assets.
- Add automated tests for owner RLS, permission denial, receipt reconciliation and import idempotency; add smoke tests for mobile and desktop flows.
- Run available lint/typecheck/tests/build; report exactly what ran and what cannot be tested without credentials/network.
- Avoid destructive operations and deploys without user approval. GitHub remote creation, pushing commits, provisioning Supabase, inviting external users, deploying Vercel, and running production migrations require explicit consent.
- Record meaningful decisions in `docs/DECISIONS.md` and implementation progress in `docs/IMPLEMENTATION_STATUS.md` as work proceeds.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
