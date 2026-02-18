"use client"

import { useEffect, useRef, useState } from "react"

const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000 // 4 hours

interface PlaidItem {
  id: string
  status: string
  lastSuccessfulSync: string | null
}

/**
 * Auto-sync Plaid items when visiting the finances page
 * if the last sync was more than 4 hours ago.
 * Fires once per mount — does not re-trigger on re-renders.
 */
export function useAutoSync(onSyncComplete?: () => void) {
  const hasSynced = useRef(false)
  const [isAutoSyncing, setIsAutoSyncing] = useState(false)

  useEffect(() => {
    if (hasSynced.current) return
    hasSynced.current = true

    let cancelled = false

    async function run() {
      try {
        // Fetch all Plaid items to check staleness
        const res = await fetch("/api/finances/plaid/items")
        if (!res.ok) return

        const { data: items } = (await res.json()) as { data: PlaidItem[] }
        if (!items || items.length === 0) return

        const now = Date.now()
        const staleItems = items.filter((item) => {
          if (item.status !== "ACTIVE") return false
          if (!item.lastSuccessfulSync) return true
          return now - new Date(item.lastSuccessfulSync).getTime() > STALE_THRESHOLD_MS
        })

        if (staleItems.length === 0 || cancelled) return

        setIsAutoSyncing(true)

        // Sync stale items sequentially to avoid rate limits
        for (const item of staleItems) {
          if (cancelled) break
          try {
            await fetch("/api/finances/plaid/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ plaidItemId: item.id }),
            })
          } catch {
            // Silently skip — don't block UI for auto-sync failures
          }
        }

        if (!cancelled) {
          onSyncComplete?.()
        }
      } catch {
        // Silently fail — auto-sync is best-effort
      } finally {
        if (!cancelled) {
          setIsAutoSyncing(false)
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [onSyncComplete])

  return { isAutoSyncing }
}
