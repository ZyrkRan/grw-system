# GRW CRM — Claude Code Instructions

## Project Context

Single-user service management CRM for a service business. The core operational loop is: **manage customers → log services → generate invoices → track finances**.

**Modules:** Dashboard (revenue metrics, charts, activity feed) · Customers (CRUD, VIP, service intervals) · Services (service logs with time entries, custom service types with drag-and-drop ordering) · Invoices (multi-item, status workflow: Draft → Sent → Paid/Cancelled) · Finances (bank transactions with Plaid sync, accounts, hierarchical categories with auto-categorization rules, recurring bills tracking) · Settings (company info).

**Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind v4, shadcn/ui, Prisma 7 + PostgreSQL, NextAuth v5 (credentials + JWT), Plaid SDK, Ollama (local LLM).

**Data model:** 15 models, all scoped by `userId`. Customers have serviceLogs, serviceLogs have timeEntries, invoices have invoiceItems (which can link to serviceLogs), bankAccounts have bankTransactions (which can link to serviceLogs and categories). Bills track recurring expenses with BillPayments per period. Plaid integration syncs transactions via cursor-based sync.

**Key UI:** DataTable component (sorting, filtering, column reorder, bulk select, pagination), IconPicker, dark/light theme support, full shadcn/ui library.

## Code Conventions
- App Router (RSC by default, `"use client"` only when needed)
- shadcn/ui new-york style
- Path aliases: `@/components`, `@/lib`, `@/hooks`, `@/components/ui`
- Prisma client: `src/lib/prisma.ts` — Auth config: `src/lib/auth.ts`
- All monetary values use Prisma `Decimal` type
- IDs: `cuid` for User/PlaidItem, `Int @default(autoincrement())` for everything else
- Shared analytics helpers in `src/lib/analytics-utils.ts` (bucketing, date parsing, filter construction) — always use these, never duplicate
- Custom hooks in `src/hooks/` for reusable client logic (`use-api.ts` for fetch pattern, `use-transactions.ts` for transaction state, `use-ai-categorize.ts` for Ollama integration)
- Validation schemas in `src/lib/validations/` (Zod) — one file per module

## Finances Module Architecture

The Finances page uses a single consolidated API call (`/api/finances/analytics/summary`) that returns stat cards, chart data, and bills summary. Charts receive data as props from the page — they don't self-fetch.

**Key patterns:**
- 3-tier category hierarchy: System Groups (Business/Personal, `isSystemGroup`) → Sub-groups (`isGroup`) → Leaf categories
- Filter state lives in URL search params (`tf`, `account`, `group`, `chart`) with localStorage fallback
- Categories managed via Sheet overlay, not a separate page/tab
- Auto-categorization pipeline runs on Plaid sync and CSV import: regex rules first (`src/lib/auto-categorize.ts`), then bill auto-matching by pattern + 20% amount tolerance
- Bills panel is self-contained with its own CRUD; `BillDialog` and `BillItem` are separate files under `components/finances/`
- Individual chart API endpoints (`/analytics/inflow-outflow`, `/analytics/balance`, `/analytics/category`) still exist but the main page uses the consolidated summary

## Project Scope Reference
For detailed specs — full data model, all API routes, integration configs, and what hasn't been built yet — read `PROJECT_SCOPE.md`. Only needed when working on schema changes, new API routes, or integration work.

## Plan Mode
When in plan mode or discussing implementation plans, keep explanations simple and concise. Do not include code snippets or technical implementation details unless specifically requested. Focus on high-level approach and strategy. At the end of each plan, include a concise list of unresolved questions (if any). Sacrifice grammar for brevity.

## Git Commits
Auto-commit after completing significant features. Triggers: "commit" commit the most recent changes/features OR "commit all" (commit everything, group if necessary). Use conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`) with concise summaries. If changes to commit contain a big feature, group these changes together and commit first. Group related changes; keep commits focused and cohesive.
