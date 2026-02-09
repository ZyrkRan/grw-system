# Agent: account-ui-integrator

**Type**: Frontend specialist
**Model**: general-purpose
**Status**: ⚠️ Partially completed (integration done, type restriction pending)

## Purpose
Integrate CSV import button into accounts list and restrict account type editing for Plaid accounts.

## Scope
- **Files**:
  - `src/components/finances/accounts-list.tsx` (add CSV import button for manual accounts)
  - `src/components/finances/account-dialog.tsx` (disable type field for Plaid accounts)
- **Duration**: ~10-15 minutes
- **Dependencies**: Needs CSVImportDialog from csv-ui-builder agent

## Task 1: Add CSV Import Button to Accounts List

### File
`src/components/finances/accounts-list.tsx`

### Steps
1. **Import the CSVImportDialog** component
2. **Add state for import dialog**: `const [importTarget, setImportTarget] = useState<Account | null>(null)`
3. **Add handler function**: `function handleImportCSV(account: Account) { setImportTarget(account) }`
4. **Add "Import CSV" button** in account card (after sync section):
   - Show ONLY for manual (non-Plaid) accounts: `{!isPlaid && ...}`
   - Button: outlined, small size, with Upload icon
5. **Add the dialog component** at the end

### Status
✅ Completed - CSV import button and dialog integration added to accounts-list.tsx

## Task 2: Restrict Account Type Editing for Plaid Accounts

### File
`src/components/finances/account-dialog.tsx`

### Steps
1. **Find the account type Select component** (around lines 100-120)
2. **Add `disabled` prop** to the Select: `disabled={!!account?.plaidAccountId}`
3. **Add helper text** below the Select when disabled

### Status
❌ Pending - Account type restriction not yet implemented

## Deliverable
Updated UI with CSV import integration and account edit restrictions
