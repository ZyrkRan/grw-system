# GRW CRM — Claude Code Instructions

Service management CRM built with Next.js 16, React 19, Tailwind v4, shadcn/ui, Prisma 7 + PostgreSQL, NextAuth v5, Plaid API, n8n webhooks. Run UI and API agents in parallel when possible.

## Code Conventions
- App Router (RSC by default, `"use client"` only when needed)
- shadcn/ui new-york style
- Path aliases: `@/components`, `@/lib`, `@/hooks`, `@/components/ui`
- Prisma client: `src/lib/prisma.ts` — Auth config: `src/lib/auth.ts`
- All monetary values use Prisma `Decimal` type
- IDs: `cuid` for User/PlaidItem, `Int @default(autoincrement())` for everything else

## Project Scope Reference
For full context about modules, data model, integrations, and API routes, read `PROJECT_SCOPE.md` in the project root.

## Communication
Ask clarifying questions before starting work when the request is ambiguous, has multiple valid approaches, or lacks context about desired behavior/appearance. Don't assume — confirm.

## Git Commits
Auto-commit after completing significant features. Triggers: "commit" you decide best way to commit OR "commit this" (single feature) or "commit all" (commit everything, group if necessary). Use conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`) with concise summaries. Group related changes; keep commits focused and cohesive.
