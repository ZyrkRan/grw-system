import { NextResponse } from "next/server"

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup stale entries every 5 minutes
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 5 * 60 * 1000

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key)
  }
}

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number
  /** Window duration in seconds */
  windowSeconds: number
}

interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
}

/**
 * Check rate limit for a given key (typically userId + route).
 * Uses a fixed-window counter stored in-memory.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanup()

  const now = Date.now()
  const windowMs = config.windowSeconds * 1000
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    // Start a new window
    const resetAt = now + windowMs
    store.set(key, { count: 1, resetAt })
    return { success: true, remaining: config.limit - 1, resetAt }
  }

  if (entry.count >= config.limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return {
    success: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  }
}

/**
 * Predefined rate limit configs for different route types.
 */
export const rateLimits = {
  /** Standard API read operations — 60 req / 60s */
  standard: { limit: 60, windowSeconds: 60 },
  /** Write/mutate operations — 30 req / 60s */
  write: { limit: 30, windowSeconds: 60 },
  /** Plaid sync — 5 req / 60s (expensive external API call) */
  plaidSync: { limit: 5, windowSeconds: 60 },
  /** Plaid webhook-triggered sync — 3 req / 60s per PlaidItem */
  plaidWebhookSync: { limit: 3, windowSeconds: 60 },
  /** CSV import — 10 req / 60s */
  import: { limit: 10, windowSeconds: 60 },
} as const

/**
 * Helper to create a rate-limited error response with retry headers.
 */
export function rateLimitResponse(resetAt: number) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000)
  return NextResponse.json(
    { success: false, error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
      },
    }
  )
}
