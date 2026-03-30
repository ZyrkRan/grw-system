"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  Check,
  Clock,
  AlertTriangle,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  CreditCard,
  Zap,
  SkipForward,
  Undo2,
  ReceiptText,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ─── Types ───────────────────────────────────────────────────────────────────

interface BillCategory {
  id: number
  name: string
  color: string
}

interface BillAccount {
  id: number
  name: string
}

interface BillPayment {
  id: number
  status: string
  actualAmount: number | null
  paidAt: string | null
  transaction: {
    id: number
    description: string
    amount: number | string
    date: string
  } | null
}

interface Bill {
  id: number
  name: string
  expectedAmount: number
  dueDay: number
  frequency: string
  categoryId: number | null
  accountId: number | null
  isAutoPay: boolean
  isActive: boolean
  matchPattern: string | null
  notes: string | null
  color: string | null
  category: BillCategory | null
  account: BillAccount | null
  currentPayment: BillPayment | null
  dueDate: string
  isOverdue: boolean
}

interface BillsSummary {
  totalBills: number
  paidCount: number
  totalExpected: number
  totalPaid: number
  remaining: number
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatCurrencyExact(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

const BILL_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
]

// ─── Bill Dialog ─────────────────────────────────────────────────────────────

function BillDialog({
  open,
  onOpenChange,
  bill,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bill?: Bill | null
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<BillAccount[]>([])
  const [categories, setCategories] = useState<BillCategory[]>([])

  // Form state
  const [name, setName] = useState("")
  const [expectedAmount, setExpectedAmount] = useState("")
  const [dueDay, setDueDay] = useState("1")
  const [frequency, setFrequency] = useState("MONTHLY")
  const [categoryId, setCategoryId] = useState<string>("")
  const [accountId, setAccountId] = useState<string>("")
  const [isAutoPay, setIsAutoPay] = useState(false)
  const [matchPattern, setMatchPattern] = useState("")
  const [notes, setNotes] = useState("")
  const [color, setColor] = useState(BILL_COLORS[0])

  // Load accounts & categories on open
  useEffect(() => {
    if (!open) return
    Promise.all([
      fetch("/api/finances/accounts").then((r) => r.json()),
      fetch("/api/finances/categories").then((r) => r.json()),
    ]).then(([accRes, catRes]) => {
      if (accRes.success) setAccounts(accRes.data)
      if (catRes.success) {
        // Flatten categories
        const flat: BillCategory[] = []
        for (const cat of catRes.data) {
          if (!cat.isSystemGroup) flat.push({ id: cat.id, name: cat.name, color: cat.color })
          if (cat.children) {
            for (const child of cat.children) {
              flat.push({ id: child.id, name: child.name, color: child.color })
              if (child.children) {
                for (const gc of child.children) {
                  flat.push({ id: gc.id, name: gc.name, color: gc.color })
                }
              }
            }
          }
        }
        setCategories(flat)
      }
    })
  }, [open])

  // Populate form when editing
  useEffect(() => {
    if (bill) {
      setName(bill.name)
      setExpectedAmount(String(bill.expectedAmount))
      setDueDay(String(bill.dueDay))
      setFrequency(bill.frequency)
      setCategoryId(bill.categoryId ? String(bill.categoryId) : "")
      setAccountId(bill.accountId ? String(bill.accountId) : "")
      setIsAutoPay(bill.isAutoPay)
      setMatchPattern(bill.matchPattern || "")
      setNotes(bill.notes || "")
      setColor(bill.color || BILL_COLORS[0])
    } else {
      setName("")
      setExpectedAmount("")
      setDueDay("1")
      setFrequency("MONTHLY")
      setCategoryId("")
      setAccountId("")
      setIsAutoPay(false)
      setMatchPattern("")
      setNotes("")
      setColor(BILL_COLORS[Math.floor(Math.random() * BILL_COLORS.length)])
    }
  }, [bill, open])

  const handleSubmit = async () => {
    if (!name.trim() || !expectedAmount) return
    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        expectedAmount: parseFloat(expectedAmount),
        dueDay: parseInt(dueDay),
        frequency,
        isAutoPay,
        color,
        ...(categoryId ? { categoryId: parseInt(categoryId) } : {}),
        ...(accountId ? { accountId: parseInt(accountId) } : {}),
        ...(matchPattern.trim() ? { matchPattern: matchPattern.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }

      const url = bill ? `/api/finances/bills/${bill.id}` : "/api/finances/bills"
      const method = bill ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        onSuccess()
        onOpenChange(false)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{bill ? "Edit Bill" : "Add Bill"}</DialogTitle>
          <DialogDescription>
            {bill ? "Update bill details." : "Add a recurring bill to track."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3 space-y-1.5">
              <Label htmlFor="bill-name">Name</Label>
              <Input
                id="bill-name"
                placeholder="e.g., Rent, Netflix, Electric"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-1 pt-1">
                {BILL_COLORS.slice(0, 7).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      "size-5 rounded-full transition-all",
                      color === c ? "ring-2 ring-offset-2 ring-primary" : "hover:scale-110"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bill-amount">Amount</Label>
              <Input
                id="bill-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-due">Due Day</Label>
              <Input
                id="bill-due"
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="BIWEEKLY">Biweekly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  <SelectItem value="ANNUAL">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <div className="flex items-center gap-2">
                        <div className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bill-pattern">Match Pattern (regex, for auto-matching transactions)</Label>
            <Input
              id="bill-pattern"
              placeholder="e.g., NETFLIX|Netflix"
              value={matchPattern}
              onChange={(e) => setMatchPattern(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="bill-autopay"
              checked={isAutoPay}
              onCheckedChange={(v) => setIsAutoPay(v === true)}
            />
            <Label htmlFor="bill-autopay" className="text-sm font-normal cursor-pointer">
              Auto-pay enabled (informational — marks the bill as auto-deducted)
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bill-notes">Notes</Label>
            <Textarea
              id="bill-notes"
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !name.trim() || !expectedAmount}>
            {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
            {bill ? "Save Changes" : "Add Bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Bill Item ───────────────────────────────────────────────────────────────

function BillItem({
  bill,
  onTogglePaid,
  onEdit,
  onDelete,
  onSkip,
  loading,
}: {
  bill: Bill
  onTogglePaid: (bill: Bill) => void
  onEdit: (bill: Bill) => void
  onDelete: (bill: Bill) => void
  onSkip: (bill: Bill) => void
  loading: boolean
}) {
  const isPaid = bill.currentPayment?.status === "paid"
  const isSkipped = bill.currentPayment?.status === "skipped"
  const isOverdue = bill.isOverdue && !isPaid && !isSkipped
  const today = new Date()
  const dueDate = new Date(bill.dueDate)
  const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const isDueSoon = !isPaid && !isSkipped && daysUntilDue >= 0 && daysUntilDue <= 3

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors group",
        isPaid && "opacity-60",
        isSkipped && "opacity-40",
        isOverdue && "bg-red-50 dark:bg-red-950/20",
        isDueSoon && !isOverdue && "bg-amber-50 dark:bg-amber-950/20",
      )}
    >
      {/* Check button */}
      <button
        type="button"
        onClick={() => onTogglePaid(bill)}
        disabled={loading || isSkipped}
        className={cn(
          "flex-shrink-0 size-6 rounded-full border-2 flex items-center justify-center transition-all",
          isPaid
            ? "border-green-500 bg-green-500 text-white"
            : isOverdue
              ? "border-red-400 hover:border-red-500"
              : "border-muted-foreground/30 hover:border-primary"
        )}
      >
        {isPaid && <Check className="size-3.5" />}
      </button>

      {/* Color dot + name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div
            className="size-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: bill.color || "#94a3b8" }}
          />
          <span className={cn("text-sm font-medium truncate", isPaid && "line-through")}>
            {bill.name}
          </span>
          {bill.isAutoPay && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Zap className="size-3 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent>Auto-pay</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isOverdue && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              Overdue
            </Badge>
          )}
          {isDueSoon && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600">
              Due soon
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">
            Due {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          {bill.category && (
            <span className="text-xs text-muted-foreground">
              · {bill.category.name}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <p className={cn("text-sm font-semibold tabular-nums", isPaid && "text-green-600")}>
          {formatCurrencyExact(
            isPaid && bill.currentPayment?.actualAmount
              ? bill.currentPayment.actualAmount
              : bill.expectedAmount
          )}
        </p>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(bill)}>
            <Pencil className="size-4 mr-2" /> Edit
          </DropdownMenuItem>
          {!isPaid && !isSkipped && (
            <DropdownMenuItem onClick={() => onSkip(bill)}>
              <SkipForward className="size-4 mr-2" /> Skip this month
            </DropdownMenuItem>
          )}
          {isSkipped && (
            <DropdownMenuItem onClick={() => onTogglePaid(bill)}>
              <Undo2 className="size-4 mr-2" /> Unskip
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => onDelete(bill)}>
            <Trash2 className="size-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function BillsPanel({ refreshKey }: { refreshKey?: number }) {
  const [bills, setBills] = useState<Bill[]>([])
  const [summary, setSummary] = useState<BillsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Bill | null>(null)

  const fetchBills = useCallback(async () => {
    try {
      const res = await fetch("/api/finances/bills")
      const data = await res.json()
      if (data.success) {
        setBills(data.data.bills)
        setSummary(data.data.summary)
      }
    } catch (err) {
      console.error("Failed to fetch bills:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBills()
  }, [fetchBills, refreshKey])

  const handleTogglePaid = async (bill: Bill) => {
    setActionLoading(true)
    try {
      const isPaid = bill.currentPayment?.status === "paid"
      const isSkipped = bill.currentPayment?.status === "skipped"

      await fetch(`/api/finances/bills/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentUpdate: {
            status: isPaid || isSkipped ? "pending" : "paid",
            actualAmount: bill.expectedAmount,
          },
        }),
      })
      await fetchBills()
    } finally {
      setActionLoading(false)
    }
  }

  const handleSkip = async (bill: Bill) => {
    setActionLoading(true)
    try {
      await fetch(`/api/finances/bills/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentUpdate: { status: "skipped" },
        }),
      })
      await fetchBills()
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setActionLoading(true)
    try {
      await fetch(`/api/finances/bills/${deleteConfirm.id}`, { method: "DELETE" })
      setDeleteConfirm(null)
      await fetchBills()
    } finally {
      setActionLoading(false)
    }
  }

  const progressPercent = summary
    ? summary.totalBills > 0
      ? Math.round((summary.paidCount / summary.totalBills) * 100)
      : 0
    : 0

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-2 w-full" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ReceiptText className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Bills</h3>
              {summary && summary.totalBills > 0 && (
                <span className="text-xs text-muted-foreground">
                  {summary.paidCount}/{summary.totalBills} paid
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => {
                setEditingBill(null)
                setDialogOpen(true)
              }}
            >
              <Plus className="size-4" />
            </Button>
          </div>

          {/* Progress */}
          {summary && summary.totalBills > 0 && (
            <div className="mb-4 space-y-1.5">
              <Progress value={progressPercent} className="h-1.5" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatCurrency(summary.totalPaid)} paid</span>
                <span>{formatCurrency(summary.remaining)} remaining</span>
              </div>
            </div>
          )}

          {/* Bills list */}
          {bills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CreditCard className="size-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No bills yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setEditingBill(null)
                  setDialogOpen(true)
                }}
              >
                <Plus className="size-4 mr-1" /> Add your first bill
              </Button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {bills.map((bill) => (
                <BillItem
                  key={bill.id}
                  bill={bill}
                  onTogglePaid={handleTogglePaid}
                  onEdit={(b) => {
                    setEditingBill(b)
                    setDialogOpen(true)
                  }}
                  onDelete={setDeleteConfirm}
                  onSkip={handleSkip}
                  loading={actionLoading}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bill create/edit dialog */}
      <BillDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bill={editingBill}
        onSuccess={fetchBills}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Bill</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deleteConfirm?.name}&rdquo;? This will also remove all payment history for this bill.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={actionLoading}>
              {actionLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
