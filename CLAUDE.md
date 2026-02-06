# GRW CRM — Claude Code Instructions

## Project Overview
Service management CRM (formerly "KN Multi-Services") built with Next.js 16, React 19, Tailwind v4, shadcn/ui, Prisma + PostgreSQL, NextAuth v5, Plaid API, and n8n webhooks.

## Build Plan
Follow the phased build plan in `plans/build-plan.md`. Each phase should be committed separately using the auto-commit-manager agent.

## Agent Usage (REQUIRED)

Always use the appropriate specialized agent for the task at hand. **Run agents in parallel when their work is independent.**

### nextjs-fullstack-builder
Use for frontend/UI implementation:
- Creating/modifying pages, components, and layouts
- Prisma schema changes and database work
- shadcn/ui component integration
- Bug fixes in application code

### nextjs-api-builder
Use for backend/API implementation (runs in parallel with nextjs-fullstack-builder):
- Building API routes (route.ts files)
- API route logic, validation, and error handling
- n8n webhook endpoints

### auto-commit-manager
Use after completing each phase or meaningful unit of work to:
- Stage and commit changes with conventional commit messages
- Follow the commit messages specified in the build plan

### Explore
Use for codebase research when:
- Understanding existing patterns before making changes
- Finding files or code across the project
- Investigating bugs or understanding data flow

### Plan
Use when:
- Designing implementation strategy for a complex phase
- Identifying architectural trade-offs before building

### Bash
Use for:
- Running `npx prisma generate`, `npx prisma db push`, `npm run build`, `npm run dev`
- Git operations
- Installing packages (`npx shadcn@latest add ...`, `npm install ...`)
- Any terminal commands

## Workflow Pattern (Parallel)
1. Use **Plan** or **Explore** agents to understand what needs to be built
2. Launch **nextjs-fullstack-builder** (pages/components) and **nextjs-api-builder** (API routes) **in parallel**
3. Use **Bash** to run prisma generate, build checks, etc.
4. Use **auto-commit-manager** agent to commit with the specified message

## Code Conventions
- Use App Router (RSC by default, `"use client"` only when needed)
- shadcn/ui new-york style (already configured in components.json)
- Path aliases: `@/components`, `@/lib`, `@/hooks`, `@/components/ui`
- Prisma client singleton at `src/lib/prisma.ts`
- Auth config at `src/lib/auth.ts`
- API routes use Next.js Route Handlers
- All monetary values use Prisma `Decimal` type
- IDs: `cuid` for User/PlaidItem, `Int @default(autoincrement())` for everything else

## Key Directories
```
prisma/              — Schema and migrations
src/app/             — Pages and API routes (App Router)
src/components/      — React components (ui/ for shadcn)
src/lib/             — Utilities (auth, prisma, plaid, n8n, utils)
src/hooks/           — Custom React hooks
plans/               — Build plans and documentation
```
