import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveCategoryGroupIds } from "@/lib/category-group-filter"

/**
 * Granularity type for analytics bucketing
 */
export type Granularity = "daily" | "weekly" | "monthly"

/**
 * Determine the appropriate granularity based on the date range duration.
 * - < 32 days: daily
 * - 32-90 days: weekly
 * - > 90 days: monthly
 */
export function calculateGranularity(startDate: Date, endDate: Date): Granularity {
  const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  if (durationDays < 32) return "daily"
  if (durationDays <= 90) return "weekly"
  return "monthly"
}

/**
 * Convert a date to a bucket key string based on granularity.
 * - daily: YYYY-MM-DD
 * - weekly: YYYY-MM-DD (of the Monday)
 * - monthly: YYYY-MM
 */
export function toBucketKey(date: Date, granularity: Granularity): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")

  switch (granularity) {
    case "daily":
      return `${y}-${m}-${d}`
    case "weekly": {
      const day = date.getDay()
      const diff = day === 0 ? -6 : 1 - day
      const monday = new Date(y, date.getMonth(), date.getDate() + diff)
      return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`
    }
    case "monthly":
      return `${y}-${m}`
  }
}

/**
 * Generate all bucket keys for a date range at the given granularity.
 * Ensures continuity across the range (no gaps).
 */
export function generateBucketKeys(start: Date, end: Date, granularity: Granularity): string[] {
  const keys: string[] = []
  const current = new Date(start)

  switch (granularity) {
    case "daily":
      while (current <= end) {
        keys.push(toBucketKey(current, granularity))
        current.setDate(current.getDate() + 1)
      }
      break
    case "weekly": {
      const day = current.getDay()
      current.setDate(current.getDate() + (day === 0 ? -6 : 1 - day))
      while (current <= end) {
        keys.push(toBucketKey(current, granularity))
        current.setDate(current.getDate() + 7)
      }
      break
    }
    case "monthly":
      current.setDate(1)
      while (current <= end) {
        keys.push(toBucketKey(current, granularity))
        current.setMonth(current.getMonth() + 1)
      }
      break
  }
  return keys
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * Format a bucket key into a human-readable label.
 * - daily/weekly: "MMM D" (e.g., "Mar 15")
 * - monthly: "MMM YYYY" (e.g., "Mar 2026")
 */
export function formatBucketLabel(key: string, granularity: Granularity): string {
  switch (granularity) {
    case "daily":
    case "weekly": {
      const [, m, d] = key.split("-")
      return `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
    }
    case "monthly": {
      const [y, m] = key.split("-")
      return `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${y}`
    }
  }
}

/**
 * Parse and validate analytics query parameters.
 * Consolidates date parsing, account ID parsing, category group resolution, granularity calculation, and baseWhere filter construction.
 *
 * Returns an object containing:
 * - startDate: The parsed start date (beginning of day)
 * - endDate: The parsed end date (end of day)
 * - accountId: The parsed account ID, or null if "all" or not provided
 * - categoryGroupIds: Array of category IDs in the specified group (or undefined)
 * - granularity: The calculated or provided granularity level
 * - baseWhere: Prisma where clause for filtering transactions (userId, date range, accountId, categoryId)
 */
export async function parseAnalyticsParams(request: NextRequest, userId: string) {
  const searchParams = request.nextUrl.searchParams

  // Parse account ID
  const accountIdParam = searchParams.get("accountId")
  const accountId = accountIdParam && accountIdParam !== "all" ? parseInt(accountIdParam, 10) : null
  if (accountId !== null && isNaN(accountId)) {
    throw new Error("Invalid account ID")
  }

  // Parse date parameters
  const dateFromParam = searchParams.get("dateFrom")
  const dateToParam = searchParams.get("dateTo")

  let startDate: Date
  let endDate: Date

  if (dateFromParam && dateToParam) {
    const [fy, fm, fd] = dateFromParam.split("-").map(Number)
    const [ty, tm, td] = dateToParam.split("-").map(Number)
    startDate = new Date(fy, fm - 1, fd, 0, 0, 0, 0)
    endDate = new Date(ty, tm - 1, td, 23, 59, 59, 999)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error("Invalid date format")
    }
    if (endDate < startDate) {
      throw new Error("dateTo must be after dateFrom")
    }
  } else {
    // All time: find earliest transaction date
    const earliest = await prisma.bankTransaction.findFirst({
      where: { userId },
      orderBy: { date: "asc" },
      select: { date: true },
    })
    startDate = earliest ? new Date(earliest.date) : new Date()
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date()
    endDate.setHours(23, 59, 59, 999)
  }

  // Calculate or use provided granularity
  const granularityParam = searchParams.get("granularity")
  const granularity: Granularity =
    granularityParam && ["daily", "weekly", "monthly"].includes(granularityParam)
      ? (granularityParam as Granularity)
      : calculateGranularity(startDate, endDate)

  // Category group filter (business/personal)
  const categoryGroup = searchParams.get("categoryGroup")
  const categoryGroupIds = await resolveCategoryGroupIds(userId, categoryGroup)

  // Build base where clause
  const baseWhere = {
    userId,
    date: { gte: startDate, lte: endDate },
    ...(accountId ? { accountId } : {}),
    ...(categoryGroupIds ? { categoryId: { in: categoryGroupIds } } : {}),
  }

  return {
    startDate,
    endDate,
    accountId,
    categoryGroupIds,
    granularity,
    baseWhere,
  }
}
