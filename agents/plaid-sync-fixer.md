# Agent: plaid-sync-fixer

**Type**: Backend specialist
**Model**: general-purpose
**Status**: ✅ Completed

## Purpose
Fix Plaid error handling in sync endpoint to make reconnect button appear for more error scenarios beyond just ITEM_LOGIN_REQUIRED.

## Scope
- **Files**: `src/app/api/finances/plaid/sync/route.ts` (lines 202-228)
- **Duration**: ~5-10 minutes
- **Dependencies**: None (fully independent)

## Task Description
Expand error handling to catch multiple Plaid error codes (INTERNAL_SERVER_ERROR, INVALID_CREDENTIALS, etc.) and set appropriate PlaidItem status.

## Implementation Details

### Problem
Currently, the reconnect button only appears when `PlaidItem.status === "LOGIN_REQUIRED"`, but the sync endpoint only sets this status for the specific error code `ITEM_LOGIN_REQUIRED`. When users get other errors like `INTERNAL_SERVER_ERROR`, the status never gets updated, so the reconnect button never appears.

### Solution
Modify the error handling block to:
1. **Expand the reconnect-required errors** to include:
   - ITEM_LOGIN_REQUIRED
   - INVALID_CREDENTIALS
   - INVALID_UPDATED_USERNAME
   - INVALID_MFA
   - INTERNAL_SERVER_ERROR (can indicate stale access token)
   - ITEM_NOT_SUPPORTED

2. **Update the logic**:
   - If error code is in the reconnectRequired array → set status to "LOGIN_REQUIRED" and return `{ success: false, error: "LOGIN_REQUIRED", loginRequired: true }`
   - For other errors → set status to "ERROR"
   - Always update the `lastError` field with the Plaid error message

## Deliverable
✅ Updated sync endpoint that sets LOGIN_REQUIRED status for all reconnection-requiring errors

## Result
Successfully expanded error handling from 1 error code to 6 error codes. Reconnect button will now appear for all authentication and connection issues.
