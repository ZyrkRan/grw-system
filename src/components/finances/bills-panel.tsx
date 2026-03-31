"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  Loader2,
  CreditCard,
  ReceiptText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BillDialog } from "./bill-dialog"
import { BillItem } from "./bill-item"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BillCategory {
  id: number
  name: string
  color: string
}

export interface BillAccount {
  id: number
  name: string
}

export interface BillPayment {
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

export interface Bill {
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
