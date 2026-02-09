# Agent: csv-api-builder

**Type**: Backend specialist
**Model**: general-purpose
**Status**: ✅ Completed

## Purpose
Create transaction import API endpoint for bulk CSV imports with validation, duplicate detection, and Prisma bulk insert.

## Scope
- **Files**: `src/app/api/finances/transactions/import/route.ts` (new file)
- **Duration**: ~10-15 minutes
- **Dependencies**: None (API contract specified in plan)

## API Specification

### Endpoint
`POST /api/finances/transactions/import`

### Request Body
```typescript
{
  accountId: number
  transactions: Array<{
    date: string // ISO date string
    description: string
    amount: number // absolute value
    type: "INFLOW" | "OUTFLOW"
    merchantName?: string | null
  }>
}
```

### Response
```typescript
{
  success: true,
  data: {
    imported: number,      // count of successfully imported transactions
    skipped: number,       // count of duplicates
    errors: Array<{ row: number, error: string }>  // validation errors
  }
}
```

## Implementation Requirements

1. **Auth**: Use `import { auth } from "@/lib/auth"` and verify `session.user!.id!` (Prisma 7 TS quirk)

2. **Account Ownership**: Verify the account belongs to the user

3. **Duplicate Detection**: Check for existing transactions with same:
   - accountId
   - date (within same day)
   - description (case-insensitive match)
   - amount (exact match)

   Skip duplicates and count them in the `skipped` field.

4. **Bulk Insert**: Use Prisma's `createMany` for valid transactions with proper field mapping

5. **Validation**: For each transaction:
   - Date is valid and not in future
   - Description is not empty
   - Amount is positive number
   - Type is "INFLOW" or "OUTFLOW"

## Deliverable
✅ Working POST endpoint that accepts transaction array and returns import summary with validation, duplicate detection, and bulk insert functionality
