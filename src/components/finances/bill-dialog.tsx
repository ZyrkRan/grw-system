"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import type { Bill, BillCategory, BillAccount } from "./bills-panel"

const BILL_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
]

export function BillDialog({
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
