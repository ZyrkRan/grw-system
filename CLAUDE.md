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

## Git Commit Strategy
Proactively monitor for uncommitted changes and commit automatically after completing significant features or milestones. Follow these guidelines:

**Commit Triggers:**
- After implementing complete features or major updates
- When user says "commit this" → commit current feature with focused description
- When user says "commit all" → group changes by feature/module and create separate commits per logical unit

**Commit Message Format:**
- Use conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- First line: concise summary (50-70 chars)
- Body: bullet points explaining what changed and why (not how)
- Always include: `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`

**Grouping Strategy:**
When committing multiple files, group by:
1. Feature domain (e.g., finances, services, jobs)
2. Change type (e.g., UI components, API routes, database schema)
3. Logical dependency (e.g., component + its route + its types)

Never commit unrelated changes together. Each commit should represent one cohesive unit of work.
