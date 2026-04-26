// Parse a free-text search query into a date match descriptor.
// Returns null if the query doesn't look like a date.
//
// Used by both the transaction table (client-side filter) and the
// /api/tax/transactions route (server-side WHERE clause), so this file
// must stay framework-agnostic — no React, no Next, no Prisma.

export type DateMatch =
  | { kind: "range"; gte: Date; lt: Date }
  | { kind: "monthOnly"; month: number } // 1-12
  | { kind: "monthDay"; month: number; day: number } // 1-12, 1-31
  | null

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

function dayRange(year: number, month: number, day: number): { gte: Date; lt: Date } {
  const gte = new Date(year, month - 1, day)
  const lt = new Date(year, month - 1, day + 1)
  return { gte, lt }
}

function monthRange(year: number, month: number): { gte: Date; lt: Date } {
  const gte = new Date(year, month - 1, 1)
  const lt = new Date(year, month, 1)
  return { gte, lt }
}

function yearRange(year: number): { gte: Date; lt: Date } {
  const gte = new Date(year, 0, 1)
  const lt = new Date(year + 1, 0, 1)
  return { gte, lt }
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12) return false
  if (d < 1 || d > 31) return false
  // Reject impossible combos like Feb 30 by round-tripping through Date.
  const probe = new Date(y, m - 1, d)
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d
}

function expandTwoDigitYear(y: number): number {
  // Same heuristic Excel uses: 00-29 → 2000s, 30-99 → 1900s.
  if (y < 100) return y < 30 ? 2000 + y : 1900 + y
  return y
}

export function parseDateQuery(input: string): DateMatch {
  const raw = input.trim()
  if (!raw) return null

  // ── 1. ISO-ish: YYYY-MM-DD or YYYY/MM/DD ─────────────────────────
  let m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    if (isValidYmd(y, mo, d)) return { kind: "range", ...dayRange(y, mo, d) }
    return null
  }

  // ── 2. US-ish: M-D-YYYY / M/D/YYYY (also 2-digit year) ───────────
  m = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/)
  if (m) {
    const mo = Number(m[1])
    const d = Number(m[2])
    const y = expandTwoDigitYear(Number(m[3]))
    if (isValidYmd(y, mo, d)) return { kind: "range", ...dayRange(y, mo, d) }
    return null
  }

  // ── 3. YYYY-MM / YYYY/MM ─────────────────────────────────────────
  m = raw.match(/^(\d{4})[-/](\d{1,2})$/)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    if (mo >= 1 && mo <= 12) return { kind: "range", ...monthRange(y, mo) }
    return null
  }

  // ── 4. Month-name based formats (case-insensitive) ───────────────
  // Strip a trailing comma so "Sep 5, 2025" works.
  const lower = raw.toLowerCase().replace(",", " ").replace(/\s+/g, " ").trim()
  const parts = lower.split(" ")

  // 4a. "<monthName> <day> <year>"  e.g. "September 5 2025"
  if (parts.length === 3) {
    const mo = MONTH_NAMES[parts[0]]
    const d = Number(parts[1])
    const y = Number(parts[2])
    if (mo && Number.isFinite(d) && Number.isFinite(y) && isValidYmd(y, mo, d)) {
      return { kind: "range", ...dayRange(y, mo, d) }
    }
  }

  // 4b. Two-token forms — could be "<month> <year>" or "<month> <day>"
  if (parts.length === 2) {
    const mo = MONTH_NAMES[parts[0]]
    if (mo) {
      const n = Number(parts[1])
      if (Number.isFinite(n)) {
        // 4-digit → year, 1-2 digit → day-of-month
        if (parts[1].length === 4 && n >= 1900 && n <= 2100) {
          return { kind: "range", ...monthRange(n, mo) }
        }
        if (n >= 1 && n <= 31) {
          // Validate against a leap-friendly year so Feb 29 still parses.
          if (isValidYmd(2024, mo, n)) {
            return { kind: "monthDay", month: mo, day: n }
          }
          if (isValidYmd(2023, mo, n)) {
            return { kind: "monthDay", month: mo, day: n }
          }
        }
      }
    }
  }

  // 4c. Bare month name → all instances of that month
  if (parts.length === 1) {
    const mo = MONTH_NAMES[parts[0]]
    if (mo) return { kind: "monthOnly", month: mo }
  }

  // ── 5. Bare 4-digit year ─────────────────────────────────────────
  m = raw.match(/^(\d{4})$/)
  if (m) {
    const y = Number(m[1])
    if (y >= 1900 && y <= 2100) return { kind: "range", ...yearRange(y) }
  }

  return null
}

// Expand monthOnly / monthDay matches into concrete date ranges across a
// reasonable year window. Used by the API route to OR them into a Prisma
// WHERE clause without needing raw SQL.
export function expandToRanges(
  match: Exclude<DateMatch, null>,
  yearsBack = 5,
  yearsForward = 1,
): { gte: Date; lt: Date }[] {
  if (match.kind === "range") return [{ gte: match.gte, lt: match.lt }]
  const now = new Date().getFullYear()
  const ranges: { gte: Date; lt: Date }[] = []
  for (let y = now - yearsBack; y <= now + yearsForward; y++) {
    if (match.kind === "monthOnly") ranges.push(monthRange(y, match.month))
    else if (match.kind === "monthDay") {
      if (isValidYmd(y, match.month, match.day)) ranges.push(dayRange(y, match.month, match.day))
    }
  }
  return ranges
}
