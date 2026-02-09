"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface AccountData {
  id?: number
  name: string
  type: string
  accountNumber?: string | null
  mask?: string | null
  plaidAccountId?: string | null
  currentBalance?: string | number | null
}

interface AccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: AccountData
  onSuccess: () => void
}

export function AccountDialog({
  open,
  onOpenChange,
  account,
  onSuccess,
}: AccountDialogProps) {
  const isEditing = !!account?.id

  const [name, setName] = useState("")
  const [type, setType] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [currentBalance, setCurrentBalance] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const isPlaid = !!account?.plaidAccountId

  useEffect(() => {
    if (!open) return

    if (account) {
      setName(account.name)
      setType(account.type)
      setAccountNumber(
        account.plaidAccountId
          ? account.mask ? `****${account.mask}` : ""
          : account.accountNumber ?? ""
      )
      setCurrentBalance(account.currentBalance != null ? String(account.currentBalance) : "")
    } else {
      setName("")
      setType("")
      setAccountNumber("")
      setCurrentBalance("")
    }
    setError("")
  }, [open, account])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!name.trim()) {
      setError("Name is required.")
      return
    }
    if (!type) {
      setError("Account type is required.")
      return
    }

    setIsSubmitting(true)

    try {
      const url = isEditing
        ? `/api/finances/accounts/${account.id}`
        : "/api/finances/accounts"

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          ...(!isPlaid && { accountNumber: accountNumber.trim() || null }),
          ...(!isPlaid && { currentBalance: currentBalance || null }),
        }),
      })

      const result = await res.json()

      if (!result.success) {
        setError(result.error || "Something went wrong.")
        return
      }

      onOpenChange(false)
      onSuccess()
    } catch {
      setError("Failed to save account. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Account" : "Add Account"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the account details below."
              : "Add a new manual bank account."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="acc-name">Name *</Label>
            <Input
              id="acc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Business Checking"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-type">Type *</Label>
            <Select value={type} onValueChange={setType} disabled={!!account?.plaidAccountId}>
              <SelectTrigger id="acc-type" className="w-full">
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CHECKING">Checking</SelectItem>
                <SelectItem value="SAVINGS">Savings</SelectItem>
                <SelectItem value="CREDIT">Credit</SelectItem>
              </SelectContent>
            </Select>
            {account?.plaidAccountId && (
              <p className="text-xs text-muted-foreground mt-1">
                Account type is locked for Plaid-linked accounts
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-number">Account Number</Label>
            <Input
              id="acc-number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Optional"
              disabled={isPlaid}
            />
            {isPlaid && (
              <p className="text-xs text-muted-foreground">
                Managed by Plaid — cannot be modified.
              </p>
            )}
          </div>

          {!isPlaid && (
            <div className="space-y-2">
              <Label htmlFor="acc-balance">Current Balance</Label>
              <Input
                id="acc-balance"
                type="number"
                step="0.01"
                value={currentBalance}
                onChange={(e) => setCurrentBalance(e.target.value)}
                placeholder="Optional"
              />
              <p className="text-xs text-muted-foreground">
                Anchors the balance chart to real values.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {isEditing ? "Save Changes" : "Add Account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
