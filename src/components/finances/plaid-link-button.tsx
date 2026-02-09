"use client"

import { useState, useCallback, useEffect } from "react"
import { usePlaidLink } from "react-plaid-link"
import { Landmark, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

interface PlaidLinkButtonProps {
  onSuccess: () => void
  asDropdownItem?: boolean
  onInitiate?: () => void
}

export function PlaidLinkButton({ onSuccess, asDropdownItem = false, onInitiate }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createLinkToken() {
    onInitiate?.()
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/finances/plaid", { method: "POST" })
      const result = await res.json()
      if (result.success) {
        setLinkToken(result.data.linkToken)
      } else {
        setError(result.error || "Failed to create link token")
      }
    } catch {
      setError("Failed to connect to Plaid. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const onPlaidSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { institution_id?: string; name?: string } | null }) => {
      try {
        const res = await fetch("/api/finances/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            institutionId: metadata.institution?.institution_id || null,
            institutionName: metadata.institution?.name || null,
          }),
        })
        const result = await res.json()
        if (result.success) {
          onSuccess()
        } else {
          setError(result.error || "Failed to link account")
        }
      } catch {
        setError("Failed to link account. Please try again.")
      } finally {
        setLinkToken(null)
      }
    },
    [onSuccess]
  )

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: () => setLinkToken(null),
  })

  // Once we have a link token and Plaid Link is ready, open it
  useEffect(() => {
    if (linkToken && ready) {
      open()
    }
  }, [linkToken, ready, open])

  if (asDropdownItem) {
    return (
      <>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            createLinkToken()
          }}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Landmark className="mr-2 size-4" />
          )}
          <div className="flex flex-col">
            <span>{isLoading ? "Connecting..." : "Link Bank Account"}</span>
            <span className="text-xs text-muted-foreground font-normal">
              Connect via Plaid for automatic sync
            </span>
          </div>
        </DropdownMenuItem>
        {error && (
          <p className="mt-2 px-2 text-sm text-destructive">{error}</p>
        )}
      </>
    )
  }

  return (
    <div>
      <Button
        variant="outline"
        onClick={createLinkToken}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Landmark className="mr-2 size-4" />
        )}
        {isLoading ? "Connecting..." : "Connect Bank (Plaid)"}
      </Button>
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
