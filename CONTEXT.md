# GRW-System Context Cache

> Session cache. Update when architecture, modules, or WIP focus changes meaningfully. For authoritative data (schema, routes, commits, file status) read the source — `prisma/schema.prisma`, `git log`, `git status`, etc.

**Last updated:** 2026-04-25 · **Branch:** dev

## Stack

Next.js 16.1 (App Router, RSC) · React 19 · TypeScript · TailwindCSS 4 · Radix UI / shadcn new-york · Prisma 7.3 · PostgreSQL · NextAuth 5 (credentials + JWT) · Plaid 41 · @react-pdf/renderer · Recharts · Zod + React Hook Form · Sonner · @dnd-kit · Ollama local LLM (Claude API fallback).

## Layout

- [src/app/](src/app/) — App Router. `(dashboard)/` has 12 UI pages, `api/` has 55+ route handlers, plus `login/`
- [src/components/](src/components/) — grouped by module: `ui/` (shadcn primitives), `finances/`, `dashboard/`, `services/`, `customers/`, `invoices/`, `routes/`, `ai/`
- [src/lib/](src/lib/) — utilities + `ai/` (LLM prompts) and `validations/` (Zod, one file per module) subdirs
- [src/hooks/](src/hooks/) — `use-api`, `use-transactions`, `use-ai-categorize`
- [prisma/schema.prisma](prisma/schema.prisma) — 18 models, all scoped by `userId`

## Modules

**Dashboard** — revenue metrics, charts, activity feed
**Customers** — CRUD, VIP flag, service intervals
**Services** — service logs with time entries, custom service types with drag-drop ordering
**Invoices** — multi-item, status workflow Draft → Sent → Paid/Cancelled, PDF preview
**Finances** — bank transactions (Plaid + CSV import), accounts, hierarchical categories, auto-categorization rules, recurring bills tracking, monthly + annual reports with PDF export, year/month sidebar with cross-month free-text search, rule manager sheet. Tax Review module retired into Finances 2026-04 (`TaxTransaction` / `TaxCategoryRule` retained as DB archive).
**Routes** — field service route planning with customer ordering
**AI** — chat with project context (Ollama or Claude fallback)
**Settings** — company info, Ollama config

## Key patterns (non-obvious)

### Finances
- Page = year/month sidebar + main column (transactions table or annual summary) + bills sidebar
- **3-tier category tree:** System Groups (Business/Personal, `isSystemGroup`) → Sub-groups (`isGroup`) → Leaf categories
- `BankTransaction.taxType`: `business | personal | service_income | null` (uncategorized). `isReviewed` flips true when taxType/categoryId is assigned.
- **Flagging in Annual Summary:** "Items to Review" = pure uncategorized (`taxType IS NULL`), uncapped, account-scoped. Click navigates to month + sets `status=uncategorized`.
- Cross-month "all months" free-text search uses [parse-date-query.ts](src/lib/parse-date-query.ts)
- Annual report aggregation in [finances-report-aggregator.ts](src/lib/finances-report-aggregator.ts); PDF via `@react-pdf/renderer` under `src/components/finances/pdf/`
- [categorization-rules.ts](src/lib/categorization-rules.ts) (`cleanPattern`, `matchesRule`) is shared client/server
- Auto-categorization pipeline on Plaid sync + CSV import: regex rules first ([auto-categorize.ts](src/lib/auto-categorize.ts)) — rule match sets categoryId AND/OR taxType + flips `isReviewed` and increments `applyCount`. Then bill auto-matching by pattern + 20% amount tolerance.
- Customer matching for ATH MOVIL descriptions: last 4 digits of phone
- Filter state in URL/localStorage (selected month, expanded years, status/direction filters, account)
- Bills panel self-contained: `BillDialog`, `BillItem`, `BillsPanel` under [components/finances/](src/components/finances/)
- Charts (`inflow-outflow`, `balance`, `category-analytics`, `timeframe-selector`) currently unwired pending Dashboard transition; data source `/api/finances/analytics/summary?view=dashboard` still live

## Key lib files (worth caching — non-obvious purposes)

- [analytics-utils.ts](src/lib/analytics-utils.ts) — shared bucketing/date parsing/filter construction. **Always reuse, never duplicate.**
- [auto-categorize.ts](src/lib/auto-categorize.ts) — LLM-based transaction categorization (Ollama or Claude fallback)
- [encryption.ts](src/lib/encryption.ts) — Plaid access token encrypt/decrypt
- [ollama.ts](src/lib/ollama.ts) — local LLM client with Claude API fallback
- [rate-limit.ts](src/lib/rate-limit.ts) — token bucket
- [system-categories.ts](src/lib/system-categories.ts) — ensures Business/Personal system groups exist
- [income-categories.ts](src/lib/income-categories.ts) — ensures Business-Income / Personal-Income subgroups
- [categorization-rules.ts](src/lib/categorization-rules.ts), [finances-report-aggregator.ts](src/lib/finances-report-aggregator.ts), [parse-date-query.ts](src/lib/parse-date-query.ts) — finances/categorization helpers

## Conventions

- App Router, RSC by default, `"use client"` only when needed
- shadcn new-york; aliases `@/components`, `@/lib`, `@/hooks`, `@/components/ui`
- All money → Prisma `Decimal`
- IDs: `cuid` for User/PlaidItem, `Int @default(autoincrement())` for everything else
- Single user, everything scoped by `userId`
- Zod schemas per module in `src/lib/validations/`

## Reference docs

- [CLAUDE.md](CLAUDE.md) — project instructions
- [PROJECT_SCOPE.md](PROJECT_SCOPE.md) — full data model, API routes, integration configs, unbuilt features. Read when doing schema/API/integration work.

## Current WIP focus

**No active WIP.** /finances rewrite shipped 2026-04-25 — all phases complete. See [SESSION.md](SESSION.md) for what was done, lingering follow-ups (Dashboard chart transition, categories CRUD UI, etc.), and DB archive notes.
