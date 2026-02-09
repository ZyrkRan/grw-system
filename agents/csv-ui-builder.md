# Agent: csv-ui-builder

**Type**: Frontend specialist
**Model**: general-purpose
**Status**: ⏸️ Paused

## Purpose
Create CSV import dialog component with file upload, column mapping, preview table, and import action.

## Scope
- **Files**: `src/components/finances/csv-import-dialog.tsx` (new file)
- **Duration**: ~15-20 minutes
- **Dependencies**: Needs API contract (already specified in plan), can build in parallel

## Component Specification

### Props
```typescript
interface CSVImportDialogProps {
  accountId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}
```

### Features

#### 1. File Upload Step
- `<input type="file" accept=".csv" />` for file selection
- Parse CSV client-side (use built-in `String.split()` or simple parsing)
- Show filename after selection

#### 2. Column Mapping Step
- Auto-detect column headers from first row
- Provide dropdowns to map CSV columns to:
  - **Date** (required) - support formats: MM/DD/YYYY, YYYY-MM-DD, DD/MM/YYYY
  - **Description** (required)
  - **Amount** (required) - handle both positive/negative values and separate debit/credit columns
  - **Type** (optional) - INFLOW or OUTFLOW (auto-detect from amount sign if not provided)
  - **Merchant Name** (optional)
- Use shadcn/ui Select components for dropdowns

#### 3. Preview Table
- Show first 5-10 parsed rows with mapped data
- Highlight validation errors (invalid dates, missing required fields, etc.)
- Display summary: "X valid transactions, Y errors"
- Use shadcn/ui Table component

#### 4. Import Action
- Validate all rows before submitting
- POST to `/api/finances/transactions/import` with transaction array
- Show loading state during import
- Display success/error summary from API response
- Call `onSuccess()` after successful import

## UI Structure
Multi-step flow: Upload → Map Columns → Preview → Import

## Libraries
- CSV parsing: Built-in `String.split()` (no external dependencies needed)
- Date parsing: `date-fns` (already in project)
- Validation: Zod (already in project)
- UI Components: shadcn/ui Dialog, Button, Select, Table

## Deliverable
Fully functional CSVImportDialog component ready to integrate
