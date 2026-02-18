import { z } from "zod"

// ---------------------------------------------------------------------------
// Shared refinements
// ---------------------------------------------------------------------------

const trimmedString = (max = 500) => z.string().min(1).max(max).transform((s) => s.trim())
const optionalTrimmedString = (max = 500) => z.string().max(max).transform((s) => s.trim()).optional()
const positiveDecimal = z.coerce.number().positive()
const intId = z.coerce.number().int().positive()
const optionalIntId = z.coerce.number().int().positive().nullable().optional()
const dateString = z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date")
const transactionType = z.enum(["INFLOW", "OUTFLOW"])
const accountType = z.enum(["CHECKING", "SAVINGS", "CREDIT"])
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #ff0000")
const regexPattern = z.string().min(1).max(500).refine((s) => {
  try { new RegExp(s, "i"); return true } catch { return false }
}, "Invalid regex pattern")

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const createTransactionSchema = z.object({
  date: dateString,
  description: trimmedString(500),
  amount: positiveDecimal,
  type: transactionType,
  accountId: intId,
  notes: optionalTrimmedString(2000),
  categoryId: optionalIntId,
  serviceLogId: optionalIntId,
  merchantName: optionalTrimmedString(500),
})

export const updateTransactionSchema = z.object({
  date: dateString.optional(),
  description: trimmedString(500).optional(),
  amount: positiveDecimal.optional(),
  type: transactionType.optional(),
  notes: z.string().max(2000).transform((s) => s.trim() || null).nullable().optional(),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  serviceLogId: z.coerce.number().int().positive().nullable().optional(),
  merchantName: z.string().max(500).transform((s) => s.trim() || null).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field must be provided")

export const transactionQuerySchema = z.object({
  accountId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  type: transactionType.optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
  search: z.string().max(200).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  isPending: z.enum(["true", "false"]).optional(),
  uncategorized: z.enum(["true"]).optional(),
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(5000).default(100),
})

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

export const batchDeleteSchema = z.object({
  ids: z.array(intId).min(1).max(500),
})

export const batchCategoryAssignSchema = z.object({
  ids: z.array(intId).min(1).max(500),
  categoryId: z.coerce.number().int().positive().nullable(),
})

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export const importTransactionSchema = z.object({
  date: dateString,
  description: trimmedString(500),
  amount: positiveDecimal,
  type: transactionType,
  merchantName: optionalTrimmedString(500).nullable(),
})

export const importRequestSchema = z.object({
  accountId: intId,
  transactions: z.array(importTransactionSchema).min(1).max(5000),
})

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const createAccountSchema = z.object({
  name: trimmedString(200),
  type: accountType,
  accountNumber: z.string().max(50).transform((s) => s.trim() || null).nullable().optional(),
  currentBalance: z.coerce.number().optional(),
})

export const updateAccountSchema = z.object({
  name: trimmedString(200).optional(),
  type: accountType.optional(),
  isActive: z.boolean().optional(),
  accountNumber: z.string().max(50).transform((s) => s.trim() || null).nullable().optional(),
  currentBalance: z.coerce.number().nullable().optional(),
})

export const accountResetSchema = z.object({
  action: z.literal("reset"),
})

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const createCategorySchema = z.object({
  name: trimmedString(100),
  color: hexColor,
  parentId: optionalIntId,
  isGroup: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
  attachmentPrompt: z.boolean().default(false),
})

export const updateCategorySchema = z.object({
  name: trimmedString(100).optional(),
  color: hexColor.optional(),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  isGroup: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  attachmentPrompt: z.boolean().optional(),
})

export const reorderCategoriesSchema = z.object({
  updates: z.array(z.object({
    id: intId,
    position: z.number().int().min(0),
    parentId: z.coerce.number().int().positive().nullable().optional(),
  })).min(1).max(200),
})

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export const ATTACHMENT_MAX_COUNT = 10
export const ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024 // 5MB
export const ATTACHMENT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const

// ---------------------------------------------------------------------------
// Categorization rules
// ---------------------------------------------------------------------------

export const createRuleSchema = z.object({
  pattern: regexPattern,
  categoryId: intId,
  applyToExisting: z.boolean().default(false),
})

export const updateRuleSchema = z.object({
  pattern: regexPattern.optional(),
  categoryId: intId.optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field must be provided")

// ---------------------------------------------------------------------------
// Plaid
// ---------------------------------------------------------------------------

export const plaidSyncSchema = z.object({
  plaidItemId: z.string().min(1).max(200),
})

export const plaidExchangeSchema = z.object({
  publicToken: z.string().min(1).max(500),
  institutionId: z.string().min(1).max(200),
  institutionName: z.string().min(1).max(500),
})

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const analyticsQuerySchema = z.object({
  granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  accountId: z.coerce.number().int().positive().optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
})

// ---------------------------------------------------------------------------
// Helper: parse search params into an object for Zod validation
// ---------------------------------------------------------------------------

export function searchParamsToObject(searchParams: URLSearchParams): Record<string, string> {
  const obj: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    if (value !== "") obj[key] = value
  })
  return obj
}

// ---------------------------------------------------------------------------
// Helper: format Zod errors into a user-friendly string
// ---------------------------------------------------------------------------

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""
    return `${path}${issue.message}`
  }).join("; ")
}
