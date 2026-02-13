"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, Check, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

interface TransactionResult {
  id: number
  date: string
  description: string
  amount: number | string
  type: string
  merchantName: string | null
  account: { id: number; name: string }
}

interface TransactionLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serviceId: number
  serviceName: string
  serviceAmount: number
  serviceDate: string
  customerName: string
  onLinked: () => void
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "$0.00"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value))
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function TransactionLinkDialog({
  open,
  onOpenChange,
  serviceId,
  serviceName,
  serviceAmount,
  serviceDate,
  customerName,
  onLinked,
}: TransactionLinkDialogProps) {
  const [transactions, setTransactions] = useState<(TransactionResult & { score: number; suggested: boolean })[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [linkingId, setLinkingId] = useState<number | null>(null)

  const fetchTransactions = useCallback(async (search?: string) => {
    setIsLoading(true)
    try {
      // Fetch unlinked transactions, scored by relevance to this service
      const params = new URLSearchParams()
      params.set("pageSize", "50")
      if (search) params.set("search", search)

      const res = await fetch(`/api/finances/transactions?${params}`)
      const result = await res.json()

      if (result.success) {
        // Score and sort results by relevance to this service
        const scored = (result.data as (TransactionResult & { serviceLog: { id: number } | null })[])
          .filter((t) => !t.serviceLog) // Only unlinked transactions
          .map((txn) => {
            let score = 0

            // Amount match
            const txnAmount = Math.abs(Number(txn.amount))
            if (serviceAmount > 0 && txnAmount > 0) {
              const diff = Math.abs(txnAmount - serviceAmount)
              const pct = diff / Math.max(txnAmount, serviceAmount)
              if (pct === 0) score += 40
              else if (pct <= 0.05) score += 30
              else if (pct <= 0.1) score += 20
              else if (pct <= 0.25) score += 10
            }

            // Date proximity
            const daysDiff = Math.abs(
              (new Date(txn.date).getTime() - new Date(serviceDate).getTime()) / (1000 * 60 * 60 * 24)
            )
            if (daysDiff <= 1) score += 30
            else if (daysDiff <= 7) score += 25
            else if (daysDiff <= 14) score += 15
            else if (daysDiff <= 30) score += 5

            // Name match
            if (txn.merchantName || txn.description) {
              const searchIn = `${txn.merchantName ?? ""} ${txn.description}`.toLowerCase()
              const custLower = customerName.toLowerCase()
              if (searchIn.includes(custLower) || custLower.includes(searchIn.trim())) {
                score += 30
              }
            }

            return { ...txn, score, suggested: score >= 40 }
          })
          .sort((a, b) => b.score - a.score)

        setTransactions(scored)
      }
    } catch (err) {
      console.error("Failed to fetch transactions:", err)
    } finally {
      setIsLoading(false)
    }
  }, [serviceAmount, serviceDate, customerName])

  useEffect(() => {
    if (open) fetchTransactions()
  }, [open, fetchTransactions])

  async function handleLink(transactionId: number) {
    setLinkingId(transactionId)
    try {
      const res = await fetch(`/api/finances/transactions/${transactionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceLogId: serviceId }),
      })
      const result = await res.json()
      if (result.success) {
        onOpenChange(false)
        onLinked()
      }
    } catch (err) {
      console.error("Failed to link transaction:", err)
    } finally {
      setLinkingId(null)
    }
  }

  const suggested = transactions.filter((t) => t.suggested)
  const others = transactions.filter((t) => !t.suggested)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Link Transaction</DialogTitle>
          <DialogDescription>
            Find a transaction to link to <strong>{serviceName}</strong>
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search transactions..."
            onValueChange={(search) => fetchTransactions(search)}
          />
          <CommandList className="max-h-[400px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>No unlinked transactions found.</CommandEmpty>
                {suggested.length > 0 && (
                  <CommandGroup heading="Suggested Matches">
                    {suggested.map((txn) => (
                      <CommandItem
                        key={txn.id}
                        value={String(txn.id)}
                        onSelect={() => handleLink(txn.id)}
                        disabled={linkingId !== null}
                      >
                        {linkingId === txn.id ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 size-4 opacity-0" />
                        )}
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{txn.description}</span>
                            <Badge variant="outline" className="shrink-0 gap-1 text-xs text-blue-600 border-blue-200">
                              <Sparkles className="size-3" />
                              Match
                            </Badge>
                            <span
                              className={`ml-auto shrink-0 font-medium ${
                                txn.type === "INFLOW" ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {txn.type === "INFLOW" ? "+" : "-"}
                              {formatCurrency(txn.amount)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(txn.date)} &middot; {txn.account.name}
                            {txn.merchantName && <> &middot; {txn.merchantName}</>}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {others.length > 0 && (
                  <CommandGroup heading={suggested.length > 0 ? "All Transactions" : undefined}>
                    {others.map((txn) => (
                      <CommandItem
                        key={txn.id}
                        value={String(txn.id)}
                        onSelect={() => handleLink(txn.id)}
                        disabled={linkingId !== null}
                      >
                        {linkingId === txn.id ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 size-4 opacity-0" />
                        )}
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate">{txn.description}</span>
                            <span
                              className={`ml-auto shrink-0 font-medium ${
                                txn.type === "INFLOW" ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {txn.type === "INFLOW" ? "+" : "-"}
                              {formatCurrency(txn.amount)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(txn.date)} &middot; {txn.account.name}
                            {txn.merchantName && <> &middot; {txn.merchantName}</>}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
