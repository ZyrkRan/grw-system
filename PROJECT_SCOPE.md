# GRW CRM — Project Scope

> Reference document for the current state of the project. Read this file when you need full context about what exists, how the data model works, and what integrations are in place.

## Overview

Single-user service management CRM for a service business. Core operational loop: **manage customers -> log services -> generate invoices -> track finances**.

## Tech Stack

- **Framework:** Next.js 16 (App Router, RSC by default)
- **Frontend:** React 19, TypeScript, Tailwind CSS v4, shadcn/ui (new-york style)
- **Database:** Prisma 7 + PostgreSQL
- **Auth:** NextAuth v5 (email/password, JWT sessions)
- **Banking:** Plaid SDK + react-plaid-link
- **Automation:** n8n webhooks
- **Other:** react-hook-form + zod, @dnd-kit, next-themes, Lucide React icons

## Modules

### Dashboard (`/`)
- Revenue tracking (current vs. last month with % change)
- Customer and service metrics
- Invoice status breakdown (Draft, Sent, Paid, Cancelled)
- 6-month revenue chart
- Recent activity feed (last 10 services)

### Customers (`/customers`)
- Full CRUD with detail pages (`/customers/[id]`)
- Fields: name, phone, email, address, serviceInterval, isVip
- Service interval options (2 weeks, 3 weeks, monthly)
- VIP status toggle
- Bulk delete

### Services (`/services`)
**Service Log tab:**
- Service tracking: customer, date, price, status (PENDING/COMPLETE), payment (PAID/UNPAID)
- Time entry tracking (date, durationMinutes, description)
- Linked to customer, serviceType, bankTransactions, invoiceItems
- Bulk delete

**Service Types tab:**
- Custom types with name, slug, description, icon, position
- Lucide icon picker
- Drag-and-drop reordering

### Invoices (`/invoices`)
- Status workflow: DRAFT -> SENT -> PAID (or CANCELLED)
- Multi-item invoices with line items (InvoiceItem)
- Fields: invoiceNumber (unique), issueDate, dueDate, subtotal, total, amountPaid, notes, terms
- Line items can link to a serviceLog
- Editing/deletion restricted to DRAFT status
- Detail view at `/invoices/[id]`
- Bulk delete (drafts only)

### Finances (`/finances`)
**Transactions tab:**
- Manual and Plaid-synced bank transactions
- Fields: date, description, amount, balance, type (INFLOW/OUTFLOW)
- Plaid fields: isPending, merchantName, plaidTransactionId, rawPlaidData
- Statement tracking (month/year)
- Optional links to serviceLog and category
- Filtering by account

**Accounts tab:**
- Bank accounts (manual or Plaid-linked)
- Types: CHECKING, SAVINGS, CREDIT
- Active/inactive status, lastSyncedAt tracking
- Plaid Link and reconnect flows

**Categories tab:**
- Hierarchical categories (parent/child with isGroup flag)
- Fields: name, slug, color, icon, position, isDefault
- Drag-and-drop sortable
- Categorization rules: pattern-based auto-assignment to categories

### Settings (`/settings`)
- Company info: name, address, city, state, zip, phone, email, website

## Data Model (Prisma)

15 models, all scoped by `userId` for multi-tenancy:

| Model | ID Type | Key Relationships |
|---|---|---|
| User | cuid | Owns everything |
| Customer | autoincrement | -> serviceLogs, invoices |
| ServiceType | autoincrement | -> serviceLogs |
| ServiceLog | autoincrement | -> customer, serviceType, timeEntries, bankTransactions, invoiceItems |
| TimeEntry | autoincrement | -> serviceLog |
| Invoice | autoincrement | -> customer, invoiceItems (cascade delete) |
| InvoiceItem | autoincrement | -> invoice, serviceLog (optional) |
| PlaidItem | cuid | -> bankAccounts, user |
| BankAccount | autoincrement | -> plaidItem (optional), bankTransactions |
| BankTransaction | autoincrement | -> bankAccount, serviceLog (optional), category (optional) |
| TransactionCategory | autoincrement | -> parent (self-ref), categorizationRules, bankTransactions |
| CategorizationRule | autoincrement | -> category |
| Settings | autoincrement | Singleton per user |

Key conventions:
- All monetary values: `Decimal` type
- All models have `createdAt`/`updatedAt`
- Status tracking via enums: ServiceStatus, PaymentStatus, InvoiceStatus, PlaidItemStatus, AccountType, TransactionType

## Integrations

### Plaid (`src/lib/plaid.ts`)
- Config: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV
- Link token creation, public token exchange, transaction sync (cursor-based)
- Account status monitoring (ACTIVE, LOGIN_REQUIRED, ERROR)
- Relink and update flows
- Auto-categorization on sync

### n8n (`src/lib/n8n.ts`)
- Webhook receiver at `/api/webhooks/n8n`
- Supported actions: `ping`, `create_customer`, `update_service_status`
- Outbound trigger function: `triggerN8nWebhook(event, data)`
- Secret-based validation

### NextAuth v5 (`src/lib/auth.ts`)
- Credentials provider (email/password with bcrypt)
- JWT session strategy
- Prisma adapter
- Custom login page at `/login`
- Middleware-protected routes

## API Routes

All routes auth-protected via `auth()` session check:

- `/api/dashboard` — GET
- `/api/customers` — GET, POST
- `/api/customers/[id]` — GET, PATCH, DELETE
- `/api/service-types` — GET, POST
- `/api/service-types/[id]` — GET, PATCH, DELETE
- `/api/service-types/reorder` — POST
- `/api/services` — GET, POST
- `/api/services/[id]` — GET, PATCH, DELETE
- `/api/services/[id]/time-entries` — POST
- `/api/invoices` — GET, POST
- `/api/invoices/[id]` — GET, PATCH, DELETE
- `/api/finances/accounts` — GET, POST
- `/api/finances/accounts/[id]` — GET, PATCH, DELETE
- `/api/finances/transactions` — GET, POST
- `/api/finances/transactions/[id]` — GET, PATCH, DELETE
- `/api/finances/categories` — GET, POST
- `/api/finances/categories/[id]` — GET, PATCH, DELETE
- `/api/finances/categories/reorder` — POST
- `/api/finances/categorization-rules` — GET, POST
- `/api/finances/categorization-rules/[id]` — GET, PATCH, DELETE
- `/api/finances/plaid` — GET
- `/api/finances/plaid/exchange` — POST
- `/api/finances/plaid/sync` — POST
- `/api/finances/plaid/relink` — POST
- `/api/finances/plaid/update-link` — POST
- `/api/finances/plaid/update-link/callback` — POST
- `/api/settings` — GET, PATCH
- `/api/user` — GET
- `/api/webhooks/n8n` — POST

## Shared UI Components

- **DataTable** (`src/components/ui/data-table.tsx`) — Advanced table with sorting (localStorage-persisted), filtering, column visibility, drag-and-drop column reorder, bulk selection, search, pagination, pinned columns
- **IconPicker** (`src/components/ui/icon-picker.tsx`) — Lucide icon selector
- **LucideIcon** (`src/components/ui/lucide-icon.tsx`) — Dynamic icon renderer
- **ThemeProvider/ThemeToggle** — Dark/light mode support
- Full shadcn/ui component library installed

## What Does NOT Exist Yet

For reference, these are areas that have not been built:
- Reporting/analytics beyond the dashboard summary
- Scheduling/calendar views
- Customer-facing portal or self-service
- Email notifications or reminders
- Multi-user/team support (roles, permissions)
- File uploads or document management
- Mobile-specific layouts or PWA
- Automated recurring invoices
- Payment processing (Stripe, etc.)
