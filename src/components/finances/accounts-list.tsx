"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  Landmark,
  MoreHorizontal,
  Pencil,
  Trash2,
  RefreshCw,
  CreditCard,
  Building2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AccountDialog } from "@/components/finances/account-dialog"
import { PlaidLinkButton } from "@/components/finances/plaid-link-button"

interface PlaidItemInfo {
  institutionName: string | null
}

interface Account {
  id: number
  name: string
  accountNumber: string | null
  type: string
  isActive: boolean
  lastSyncedAt: string | null
  mask: string | null
  plaidAccountId: string | null
  plaidItemId: string | null
  _count: { transactions: number }
  plaidItem: PlaidItemInfo | null
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Never"
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function getAccountTypeLabel(type: string): string {
  switch (type) {
    case "CHECKING":
      return "Checking"
    case "SAVINGS":
      return "Savings"
    case "CREDIT":
      return "Credit"
    default:
      return type
  }
}

function getAccountTypeVariant(type: string): "default" | "secondary" | "outline" {
  switch (type) {
    case "CHECKING":
      return "default"
    case "SAVINGS":
      return "secondary"
    case "CREDIT":
      return "outline"
    default:
      return "default"
  }
}

function AccountIcon({ type }: { type: string }) {
  switch (type) {
    case "CREDIT":
      return <CreditCard className="size-5 text-muted-foreground" />
    case "SAVINGS":
      return <Building2 className="size-5 text-muted-foreground" />
    default:
      return <Landmark className="size-5 text-muted-foreground" />
  }
}

export function AccountsList() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Dialogs
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  // Sync state per account
  const [syncingAccounts, setSyncingAccounts] = useState<Set<string>>(new Set())
  const [syncResults, setSyncResults] = useState<Record<string, string>>({})

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/finances/accounts")
      const result = await res.json()
      if (result.success) {
        setAccounts(result.data)
      }
    } catch (error) {
      console.error("Failed to fetch accounts:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  function handleAddAccount() {
    setEditingAccount(undefined)
    setFormDialogOpen(true)
  }

  function handleEditAccount(account: Account) {
    setEditingAccount(account)
    setFormDialogOpen(true)
  }

  function handleDeleteClick(account: Account) {
    setDeleteTarget(account)
    setDeleteError("")
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setIsDeleting(true)
    setDeleteError("")

    try {
      const res = await fetch(`/api/finances/accounts/${deleteTarget.id}`, {
        method: "DELETE",
      })
      const result = await res.json()

      if (result.success) {
        setDeleteTarget(null)
        fetchAccounts()
      } else {
        setDeleteError(result.error || "Failed to delete account.")
      }
    } catch {
      setDeleteError("Failed to delete account. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleSync(account: Account) {
    if (!account.plaidItemId) return

    const key = String(account.id)
    setSyncingAccounts((prev) => new Set(prev).add(key))
    setSyncResults((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })

    try {
      const res = await fetch("/api/finances/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaidItemId: account.plaidItemId }),
      })
      const result = await res.json()

      if (result.success) {
        const { added, modified, removed } = result.data
        setSyncResults((prev) => ({
          ...prev,
          [key]: `Synced: ${added} added, ${modified} modified, ${removed} removed`,
        }))
        fetchAccounts()
      } else {
        setSyncResults((prev) => ({
          ...prev,
          [key]: result.error || "Sync failed.",
        }))
      }
    } catch {
      setSyncResults((prev) => ({
        ...prev,
        [key]: "Sync failed. Please try again.",
      }))
    } finally {
      setSyncingAccounts((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  function handleFormSuccess() {
    fetchAccounts()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Bank Accounts</h2>
        <div className="flex gap-2">
          <PlaidLinkButton onSuccess={fetchAccounts} />
          <Button onClick={handleAddAccount}>
            <Plus className="mr-2 size-4" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Accounts Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Landmark className="size-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No accounts yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add a manual account or connect your bank via Plaid.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => {
            const key = String(account.id)
            const isSyncing = syncingAccounts.has(key)
            const syncResult = syncResults[key]
            const isPlaid = !!account.plaidAccountId

            return (
              <Card key={account.id} className={!account.isActive ? "opacity-60" : ""}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-3">
                    <AccountIcon type={account.type} />
                    <div>
                      <CardTitle className="text-base">{account.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Badge variant={getAccountTypeVariant(account.type)}>
                          {getAccountTypeLabel(account.type)}
                        </Badge>
                        {!account.isActive && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditAccount(account)}>
                        <Pencil className="mr-2 size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => handleDeleteClick(account)}
                      >
                        <Trash2 className="mr-2 size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {(account.accountNumber || account.mask) && (
                    <div className="text-muted-foreground">
                      Account: {account.mask ? `****${account.mask}` : account.accountNumber}
                    </div>
                  )}
                  {isPlaid && account.plaidItem?.institutionName && (
                    <div className="text-muted-foreground">
                      Institution: {account.plaidItem.institutionName}
                    </div>
                  )}
                  <div className="text-muted-foreground">
                    {account._count.transactions} transaction{account._count.transactions !== 1 ? "s" : ""}
                  </div>
                  <div className="text-muted-foreground">
                    Last synced: {formatDate(account.lastSyncedAt)}
                  </div>

                  {isPlaid && (
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSync(account)}
                        disabled={isSyncing}
                      >
                        <RefreshCw
                          className={`mr-2 size-3.5 ${isSyncing ? "animate-spin" : ""}`}
                        />
                        {isSyncing ? "Syncing..." : "Sync"}
                      </Button>
                      {syncResult && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {syncResult}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Account Form Dialog */}
      <AccountDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        account={editingAccount}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.name}</strong>? This will also remove all
              associated transactions. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {deleteError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
