"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/ui/date-picker"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { TransactionAttachments } from "./transaction-attachments"

interface AccountRef {
  id: number
  name: string
}

interface CategoryRef {
  id: number
  name: string
  color: string
  attachmentPrompt?: boolean
}

interface AttachmentData {
  id: number
  fileName: string
  fileType: string
  fileSize: number
  url: string
  createdAt: string
}

interface TransactionData {
  id?: number
  date: string
  description: string
  amount: number | string
  type: string
  notes: string | null
  merchantName: string | null
  account: AccountRef
  category: CategoryRef | null
}

interface TransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: TransactionData
  onSuccess: () => void
}

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
  onSuccess,
}: TransactionDialogProps) {
  const isEditing = !!transaction?.id

  const [accounts, setAccounts] = useState<AccountRef[]>([])
  const [categories, setCategories] = useState<CategoryRef[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)

  const [date, setDate] = useState<Date | undefined>(new Date())
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [type, setType] = useState("OUTFLOW")
  const [accountId, setAccountId] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [merchantName, setMerchantName] = useState("")
  const [notes, setNotes] = useState("")

  const [attachments, setAttachments] = useState<AttachmentData[]>([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Fetch attachments when editing
  useEffect(() => {
    if (!open || !transaction?.id) {
      setAttachments([])
      return
    }

    fetch(`/api/finances/transactions/${transaction.id}/attachments`)
      .then((r) => r.json())
      .then((result) => {
        if (result.success) setAttachments(result.data)
      })
      .catch((err) => console.error("Failed to load attachments:", err))
  }, [open, transaction?.id])

  // Fetch accounts and categories when dialog opens
  useEffect(() => {
    if (!open) return
    setIsLoadingData(true)

    Promise.all([
      fetch("/api/finances/accounts").then((r) => r.json()),
      fetch("/api/finances/categories").then((r) => r.json()),
    ])
      .then(([accResult, catResult]) => {
        if (accResult.success) setAccounts(accResult.data)
        if (catResult.success) {
          const flat: CategoryRef[] = []
          for (const cat of catResult.data) {
            flat.push({ id: cat.id, name: cat.name, color: cat.color, attachmentPrompt: cat.attachmentPrompt })
            if (cat.children) {
              for (const child of cat.children) {
                flat.push({ id: child.id, name: child.name, color: child.color, attachmentPrompt: child.attachmentPrompt })
              }
            }
          }
          setCategories(flat)
        }
      })
      .catch((err) => console.error("Failed to load form data:", err))
      .finally(() => setIsLoadingData(false))
  }, [open])

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return

    if (transaction) {
      const txnDate = new Date(transaction.date)
      setDate(isNaN(txnDate.getTime()) ? new Date() : txnDate)
      setDescription(transaction.description)
      setAmount(String(Math.abs(Number(transaction.amount))))
      setType(transaction.type)
      setAccountId(String(transaction.account.id))
      setCategoryId(transaction.category ? String(transaction.category.id) : "")
      setMerchantName(transaction.merchantName ?? "")
      setNotes(transaction.notes ?? "")
    } else {
      setDate(new Date())
      setDescription("")
      setAmount("")
      setType("OUTFLOW")
      setAccountId("")
      setCategoryId("")
      setMerchantName("")
      setNotes("")
    }

    setError("")
  }, [open, transaction])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!date) {
      setError("Date is required.")
      return
    }
    if (!description.trim()) {
      setError("Description is required.")
      return
    }
    if (!amount || Number(amount) <= 0) {
      setError("Amount is required and must be positive.")
      return
    }
    if (!type) {
      setError("Type is required.")
      return
    }
    if (!accountId) {
      setError("Account is required.")
      return
    }

    setIsSubmitting(true)

    try {
      const payload: Record<string, unknown> = {
        date: date.toISOString(),
        description: description.trim(),
        amount: parseFloat(amount),
        type,
        accountId: parseInt(accountId, 10),
        notes: notes.trim() || null,
        merchantName: merchantName.trim() || null,
        categoryId:
          categoryId && categoryId !== "none"
            ? parseInt(categoryId, 10)
            : null,
      }

      const url = isEditing
        ? `/api/finances/transactions/${transaction.id}`
        : "/api/finances/transactions"

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await res.json()

      if (!result.success) {
        setError(result.error || "Something went wrong.")
        return
      }

      onOpenChange(false)
      onSuccess()
    } catch {
      setError("Failed to save transaction. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Transaction" : "Add Transaction"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the transaction details below."
              : "Add a new manual transaction."}
          </DialogDescription>
        </DialogHeader>

        {isLoadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="max-h-[calc(90vh-10rem)] pr-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="txn-date">Date *</Label>
                  <DatePicker
                    date={date}
                    onSelect={setDate}
                    maxDate={new Date()}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="txn-type">Type *</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger id="txn-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INFLOW">Inflow</SelectItem>
                      <SelectItem value="OUTFLOW">Outflow</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="txn-description">Description *</Label>
                <Input
                  id="txn-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Office supplies"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="txn-amount">Amount *</Label>
                  <Input
                    id="txn-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="txn-account">Account *</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger id="txn-account" className="w-full">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="txn-category">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="txn-category" className="w-full">
                    <SelectValue placeholder="Select category (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="txn-merchant">Merchant Name</Label>
                <Input
                  id="txn-merchant"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="txn-notes">Notes</Label>
                <Textarea
                  id="txn-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                  rows={3}
                />
              </div>

              {/* Attachments — only shown when editing an existing transaction */}
              {isEditing && transaction?.id && (
                <TransactionAttachments
                  transactionId={transaction.id}
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  promptMessage={
                    categories.find((c) => String(c.id) === categoryId)?.attachmentPrompt
                      ? `Consider attaching a receipt for ${categories.find((c) => String(c.id) === categoryId)?.name} transactions.`
                      : null
                  }
                />
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  {isEditing ? "Save Changes" : "Add Transaction"}
                </Button>
              </div>
            </form>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
