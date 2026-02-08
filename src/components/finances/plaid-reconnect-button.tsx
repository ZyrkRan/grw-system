"use client"

import { useState, useCallback } from "react"
import { usePlaidLink } from "react-plaid-link"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PlaidReconnectButtonProps {
  plaidItemId: string
  onSuccess: () => void
}

export function PlaidReconnectButton({ plaidItemId, onSuccess }: PlaidReconnectButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchUpdateLinkToken() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/finances/plaid/update-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaidItemId }),
      })
      const result = await res.json()
      if (result.success) {
        setLinkToken(result.data.linkToken)
      } else {
        setError(result.error || "Failed to start reconnection")
      }
    } catch {
      setError("Failed to connect. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const onPlaidSuccess = useCallback(async () => {
    try {
      const res = await fetch("/api/finances/plaid/update-link/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaidItemId }),
      })
      const result = await res.json()
      if (result.success) {
        onSuccess()
      } else {
        setError(result.error || "Failed to complete reconnection")
      }
    } catch {
      setError("Failed to complete reconnection. Please try again.")
    } finally {
      setLinkToken(null)
    }
  }, [plaidItemId, onSuccess])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: () => setLinkToken(null),
  })

  if (linkToken && ready) {
    open()
  }

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={fetchUpdateLinkToken}
        disabled={isLoading}
        className="h-7 px-2.5 text-xs border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
      >
        {isLoading ? (
          <Loader2 className="mr-1.5 size-3 animate-spin" />
        ) : (
          <AlertTriangle className="mr-1.5 size-3" />
        )}
        {isLoading ? "Connecting..." : "Reconnect"}
      </Button>
      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
