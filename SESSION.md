# /finances rewrite — COMPLETE

> Migration of /tax-review UX onto /finances. All phases shipped 2026-04-25.
> Plan file (now historical): `/home/zyrkr/.claude/plans/noble-jingling-raccoon.md`.

## Phase status — all done

- ✅ **Phase 1** — Schema + backfill (`prisma db push`)
- ✅ **Phase 1.5** — `TaxTransaction → BankTransaction` migration, non-destructive
- ✅ **Phase 2** — API layer, ported components, /finances-v2 page
- ✅ **Phase 2 "Items to Review" fix** (2026-04-25) — option (a) + account scope + standalone-uncategorized gating
- ✅ **Phase 3** (2026-04-25) — swap v2 → /finances, delete /tax-review UI + components
- ✅ **Phase 4** (2026-04-25) — delete /api/tax/* routes, rename libs, archive comments on Tax* models

`tsc --noEmit` clean. `next build` clean.

## What's still in the DB but not in the codebase

- `TaxTransaction` and `TaxCategoryRule` — archived. Schema retains the models (tagged with `/// Archived` comments) so the Prisma client still types them, but no application code reads or writes them. Drop only on explicit user request.

## What's still in the codebase but unwired (Dashboard follow-up)

These were used by the old /finances chart strip and now have no consumer. Per plan, hold for the Dashboard transition (1.):

- [src/components/finances/inflow-outflow-chart.tsx](src/components/finances/inflow-outflow-chart.tsx)
- [src/components/finances/balance-chart.tsx](src/components/finances/balance-chart.tsx)
- [src/components/finances/balance-chart-account-selector.tsx](src/components/finances/balance-chart-account-selector.tsx)
- [src/components/finances/category-analytics.tsx](src/components/finances/category-analytics.tsx)
- [src/components/finances/timeframe-selector.tsx](src/components/finances/timeframe-selector.tsx)

Data source `/api/finances/analytics/summary?view=dashboard` still works.

## Categories CRUD gap

`/finances` no longer has a UI to create/edit/delete categories. The data model is intact and `/api/finances/categories*` routes work. Either bolt a Sheet onto the new page later or accept managing categories via DB/scripts.

## File renames done in Phase 4

- `src/lib/tax-utils.ts` → `src/lib/categorization-rules.ts`
- `src/lib/tax-report-aggregator.ts` → `src/lib/finances-report-aggregator.ts`
- `src/components/finances/v2/*` → `src/components/finances/*` (overwrote v1 `transactions-table.tsx`)
- `src/components/tax/pdf/` → `src/components/finances/pdf/`

## Open follow-ups

1. **Dashboard transition** — move the unwired chart files above onto /dashboard. Half-day task. Source endpoint still wired.
2. **Net calculation in monthly report** — currently `Biz Income − Biz Expenses`, ignores personal flow. Decide: leave / add second card / replace.
3. **CSV import** — kept the existing Plaid-aware `csv-import-dialog.tsx` reachable via `AccountSwitcher`; tax `csv-upload-dialog.tsx` is gone with the rest of `components/tax/`.
4. **`applyCount` semantics** — incremented on Plaid sync rule fires AND on import. Confirm desired.
5. **Categories CRUD UI** — see gap section above.
6. **Stale comments / localStorage keys** — comments and keys still mention `tax-review` (e.g. `tax-review-columns` localStorage key, breadcrumb comments in `parse-date-query.ts`, batch route, report route). Keys left intentionally so users don't lose saved column prefs; comments are historical.

## Useful diagnostic scripts (in [prisma/migrations/scripts/](prisma/migrations/scripts/))

Kept for future ad-hoc use; safe to delete when no longer wanted.

- `_smoke-aggregator-fix.ts` — verifies the post-fix aggregator invariants (pure-uncategorized, no cap, account-scoped)
- `_smoke-rule-migration.ts` — confirms TaxCategoryRule fully copied into CategorizationRule
- `_smoke-april-uncat.ts` — per-account, per-month uncategorized breakdown
- `_smoke-tx-fetch.ts`, `_smoke-zod.ts`, `_smoke-sidebar-query.ts`, `_smoke-sidebar-with-account.ts`, `_smoke-count.ts`
- `_check-duplicates.ts`, `_diag-duplicate-tax-rules.ts`, `_verify-phase1.ts`

## Important footgun (still applies)

**If you regenerate the Prisma client (`prisma generate` or `db push`), hard-restart `next dev`.** HMR keeps the old in-memory client and queries against new fields fail with `PrismaClientValidationError`.
