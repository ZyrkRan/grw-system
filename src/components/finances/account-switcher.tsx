"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Check,
  ChevronsUpDown,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  RotateCcw,
  RefreshCw,
  Landmark,
  CreditCard,
  Building2,
  Upload,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { AccountDialog } from "@/components/finances/account-dialog"
import { PlaidLinkButton } from "@/components/finances/plaid-link-button"
import { PlaidReconnectButton } from "@/components/finances/plaid-reconnect-button"
import { CSVImportDialog } from "@/components/finances/csv-import-dialog"

interface PlaidItemInfo {
  id: string
  institutionName: string | null
  status: string
}

interface Account {
  id: number
  name: string
  accountNumber: string | null
  type: string
  isActive: boolean
  currentBalance: string | number | null
  lastSyncedAt: string | null
  mask: string | null
  plaidAccountId: string | null
  plaidItemId: string | null
  _count: { transactions: number }
  plaidItem: PlaidItemInfo | null
}

interface AccountSwitcherProps {
  selectedAccountId: string
  onAccountChange: (accountId: string) => void
  onSync?: () => void
}

// Create formatter at module level for performance
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Never"
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
  if (diffMins < 10080) return `${Math.floor(diffMins / 1440)}d ago`

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
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

function AccountIcon({ type, className }: { type: string; className?: string }) {
  const iconClass = cn("size-4", className)
  switch (type) {
    case "CREDIT":
      return <CreditCard className={iconClass} />
    case "SAVINGS":
      return <Building2 className={iconClass} />
    default:
      return <Landmark className={iconClass} />
  }
}

export function AccountSwitcher({ selectedAccountId, onAccountChange, onSync }: AccountSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Dialogs
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [resetTarget, setResetTarget] = useState<Account | null>(null)
  const [isResetting, setIsResetting] = useState(false)
  const [resetError, setResetError] = useState("")
  const [importTarget, setImportTarget] = useState<Account | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  // Sync state per account
  const [syncingAccounts, setSyncingAccounts] = useState<Set<string>>(new Set())
  const [syncResults, setSyncResults] = useState<Record<string, string>>({})
  const [syncCooldowns, setSyncCooldowns] = useState<Record<string, number>>({})

  const cooldownIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  useEffect(() => {
    const intervals = cooldownIntervalsRef.current
    return () => {
      intervals.forEach((id) => clearInterval(id))
      intervals.clear()
    }
  }, [])

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const res = await fetch("/api/finances/accounts")

      // Validate HTTP response
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const result = await res.json()

      if (result.success) {
        setAccounts(result.data)
      } else {
        throw new Error(result.error || "Failed to load accounts")
      }
    } catch (error) {
      console.error("Failed to fetch accounts:", error)
      setFetchError(error instanceof Error ? error.message : "Failed to load accounts")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  function startCooldown(key: string) {
    // Clear any existing interval for this key to prevent race conditions
    const existingInterval = cooldownIntervalsRef.current.get(key)
    if (existingInterval) {
      clearInterval(existingInterval)
      cooldownIntervalsRef.current.delete(key)
    }

    let remaining = 30
    setSyncCooldowns((prev) => ({ ...prev, [key]: remaining }))
    const interval = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(interval)
        cooldownIntervalsRef.current.delete(key)
        setSyncCooldowns((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        setSyncResults((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      } else {
        setSyncCooldowns((prev) => ({ ...prev, [key]: remaining }))
      }
    }, 1000)
    cooldownIntervalsRef.current.set(key, interval)
  }

  async function handleSync(account: Account, e: React.MouseEvent) {
    e.stopPropagation()
    if (!account.plaidItemId) return

    const key = String(account.id)
    if (syncCooldowns[key]) return

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

      // Validate HTTP response
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const result = await res.json()

      if (result.success) {
        const { added, modified, removed } = result.data
        setSyncResults((prev) => ({
          ...prev,
          [key]: `+${added} ~${modified} -${removed}`,
        }))
        fetchAccounts()
        onSync?.()
      } else if (result.loginRequired) {
        fetchAccounts()
      } else {
        setSyncResults((prev) => ({
          ...prev,
          [key]: result.error || "Failed",
        }))
      }
    } catch (error) {
      setSyncResults((prev) => ({
        ...prev,
        [key]: error instanceof Error ? error.message : "Error",
      }))
    } finally {
      setSyncingAccounts((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      startCooldown(key)
    }
  }

  function handleAddManualAccount() {
    setAddMenuOpen(false)
    setEditingAccount(undefined)
    setFormDialogOpen(true)
  }

  function handleEditAccount(account: Account, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingAccount(account)
    setFormDialogOpen(true)
    setOpen(false)
  }

  function handleDeleteClick(account: Account, e: React.MouseEvent) {
    e.stopPropagation()
    setDeleteTarget(account)
    setDeleteError("")
    setOpen(false)
  }

  function handleResetClick(account: Account, e: React.MouseEvent) {
    e.stopPropagation()
    setResetTarget(account)
    setResetError("")
    setOpen(false)
  }

  async function handleResetConfirm() {
    if (!resetTarget) return
    setIsResetting(true)
    setResetError("")

    try {
      const res = await fetch(`/api/finances/accounts/${resetTarget.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const result = await res.json()

      if (result.success) {
        setResetTarget(null)
        fetchAccounts()
        onSync?.()
      } else {
        setResetError(result.error || "Failed to reset account.")
      }
    } catch (error) {
      setResetError(
        error instanceof Error ? error.message : "Failed to reset account. Please try again."
      )
    } finally {
      setIsResetting(false)
    }
  }

  function handleImportCSV(account: Account, e: React.MouseEvent) {
    e.stopPropagation()
    setImportTarget(account)
    setOpen(false)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setIsDeleting(true)
    setDeleteError("")

    try {
      const res = await fetch(`/api/finances/accounts/${deleteTarget.id}`, {
        method: "DELETE",
      })

      // Validate HTTP response
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const result = await res.json()

      if (result.success) {
        // If we deleted the selected account, reset to "all"
        if (String(deleteTarget.id) === selectedAccountId) {
          onAccountChange("all")
        }
        setDeleteTarget(null)
        fetchAccounts()
      } else {
        setDeleteError(result.error || "Failed to delete account.")
      }
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete account. Please try again."
      )
    } finally {
      setIsDeleting(false)
    }
  }

  function handleFormSuccess() {
    fetchAccounts()
  }

  function handlePlaidSuccess() {
    setAddMenuOpen(false)
    fetchAccounts()
  }

  const selectedAccount = accounts.find((acc) => String(acc.id) === selectedAccountId)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[240px] justify-between shrink-0"
          >
            {isLoading ? (
              <span className="text-muted-foreground text-sm">Loading...</span>
            ) : selectedAccountId === "all" ? (
              <span className="text-sm">All Accounts</span>
            ) : selectedAccount ? (
              <div className="flex items-center gap-2 overflow-hidden min-w-0">
                <AccountIcon type={selectedAccount.type} className="shrink-0" />
                <span className="truncate text-sm">{selectedAccount.name}</span>
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">Select account...</span>
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start" sideOffset={8}>
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-sm font-medium">Accounts</span>
            <DropdownMenu open={addMenuOpen} onOpenChange={setAddMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-7">
                  <Plus className="mr-1.5 size-4" />
                  Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <PlaidLinkButton
                  onSuccess={handlePlaidSuccess}
                  asDropdownItem
                  onInitiate={() => setAddMenuOpen(false)}
                />
                <DropdownMenuItem onClick={handleAddManualAccount}>
                  <Plus className="mr-2 size-4" />
                  <div className="flex flex-col">
                    <span>Add Manual Account</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      Enter transactions manually or import CSV
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <ScrollArea className="max-h-[500px]">
            <div className="p-2 space-y-1">
              {/* All Accounts Option */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Select all accounts"
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 cursor-pointer hover:bg-accent",
                  selectedAccountId === "all" && "bg-accent"
                )}
                onClick={() => {
                  onAccountChange("all")
                  setOpen(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onAccountChange("all")
                    setOpen(false)
                  }
                }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex size-8 items-center justify-center rounded-md bg-muted shrink-0">
                    <Landmark className="size-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-sm">All Accounts</span>
                    <span className="text-xs text-muted-foreground">
                      {accounts.length} account{accounts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                {selectedAccountId === "all" && (
                  <Check className="size-4 shrink-0 ml-2" />
                )}
              </div>

              {accounts.length > 0 && (
                <>
                  <Separator className="my-1" />

                  {/* Account List */}
                  {accounts.map((account) => {
                    const key = String(account.id)
                    const isSyncing = syncingAccounts.has(key)
                    const syncResult = syncResults[key]
                    const cooldown = syncCooldowns[key]
                    const isPlaid = !!account.plaidAccountId
                    const isSelected = String(account.id) === selectedAccountId
                    const needsReconnect = account.plaidItem?.status === "LOGIN_REQUIRED"

                    return (
                      <div
                        key={account.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select ${account.name} account`}
                        className={cn(
                          "flex flex-col rounded-md px-3 py-2 cursor-pointer hover:bg-accent transition-colors",
                          isSelected && "bg-accent",
                          !account.isActive && "opacity-60"
                        )}
                        onClick={() => {
                          onAccountChange(String(account.id))
                          setOpen(false)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onAccountChange(String(account.id))
                            setOpen(false)
                          }
                        }}
                      >
                        <div className="flex items-start gap-2 min-w-0 w-full">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div className="flex size-8 items-center justify-center rounded-md bg-muted shrink-0 mt-0.5">
                              <AccountIcon type={account.type} />
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 min-w-0">
                                <span className="font-medium text-sm truncate min-w-0">
                                  {account.name}
                                </span>
                                {isSelected && (
                                  <Check className="size-4 shrink-0 text-primary" />
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                {account.currentBalance !== null && account.currentBalance !== undefined && (
                                  <span className="text-sm font-medium text-foreground shrink-0">
                                    {formatCurrency(Number(account.currentBalance))}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground shrink-0">
                                  • {getAccountTypeLabel(account.type)}
                                </span>
                                {!account.isActive && (
                                  <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
                                    Inactive
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                                <span>Synced {formatDate(account.lastSyncedAt)}</span>
                                {syncResult && cooldown && (
                                  <span className="text-green-600">• {syncResult}</span>
                                )}
                              </div>

                              {/* Reconnect Button (if needed) */}
                              {needsReconnect && (
                                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                  <PlaidReconnectButton
                                    plaidItemId={account.plaidItem!.id}
                                    onSuccess={fetchAccounts}
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons (right side) */}
                          <div className="flex items-start gap-1 shrink-0 pt-0.5">
                            {/* Sync/Import Button */}
                            {!needsReconnect && isPlaid && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => handleSync(account, e)}
                                disabled={isSyncing || !!cooldown}
                                className="h-7 px-2 text-xs whitespace-nowrap"
                                title={isSyncing ? "Syncing..." : cooldown ? `Wait ${cooldown}s` : "Sync account"}
                              >
                                {isSyncing ? (
                                  <RefreshCw className="size-3 animate-spin" />
                                ) : cooldown ? (
                                  <span className="text-green-600 font-medium">{cooldown}s</span>
                                ) : (
                                  <RefreshCw className="size-3" />
                                )}
                              </Button>
                            )}
                            {!needsReconnect && !isPlaid && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => handleImportCSV(account, e)}
                                className="h-7 px-2 text-xs"
                                title="Import CSV"
                              >
                                <Upload className="size-3" />
                              </Button>
                            )}

                            {/* Actions Menu */}
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0"
                              >
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={(e) => handleEditAccount(account, e)}>
                                <Pencil className="mr-2 size-4" />
                                Edit
                              </DropdownMenuItem>
                              {account._count.transactions > 0 && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={(e) => handleResetClick(account, e)}
                                >
                                  <RotateCcw className="mr-2 size-4" />
                                  Reset
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={(e) => handleDeleteClick(account, e)}
                              >
                                <Trash2 className="mr-2 size-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {/* Error State */}
              {fetchError && !isLoading && (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <AlertCircle className="size-10 text-destructive mb-2" />
                  <p className="text-sm font-medium text-destructive">Failed to load accounts</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    {fetchError}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchAccounts}
                    className="h-8"
                  >
                    <RefreshCw className="mr-2 size-4" />
                    Retry
                  </Button>
                </div>
              )}

              {/* Empty State */}
              {!isLoading && !fetchError && accounts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <Landmark className="size-10 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">No accounts yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add an account to get started
                  </p>
                </div>
              )}

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Account Form Dialog */}
      <AccountDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        account={editingAccount}
        onSuccess={handleFormSuccess}
      />

      {/* CSV Import Dialog */}
      <CSVImportDialog
        accountId={importTarget?.id || 0}
        open={!!importTarget}
        onOpenChange={(open: boolean) => !open && setImportTarget(null)}
        onSuccess={() => {
          setImportTarget(null)
          fetchAccounts()
        }}
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
              <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && deleteTarget._count.transactions > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This account has{" "}
              <strong>
                {deleteTarget._count.transactions} transaction
                {deleteTarget._count.transactions !== 1 ? "s" : ""}
              </strong>{" "}
              that will be permanently deleted.
            </div>
          )}
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
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset{" "}
              <strong>{resetTarget?.name}</strong>? This will delete all
              transactions but keep the account.
            </DialogDescription>
          </DialogHeader>
          {resetTarget && resetTarget._count.transactions > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <strong>
                {resetTarget._count.transactions} transaction
                {resetTarget._count.transactions !== 1 ? "s" : ""}
              </strong>{" "}
              will be permanently deleted.
              {resetTarget.plaidAccountId &&
                " The Plaid sync cursor will be reset so transactions can be re-imported."}
            </div>
          )}
          {resetError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {resetError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetTarget(null)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetConfirm}
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Account"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
