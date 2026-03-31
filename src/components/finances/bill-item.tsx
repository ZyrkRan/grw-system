"use client"

import {
  Check,
  Pencil,
  Trash2,
  SkipForward,
  Undo2,
  MoreHorizontal,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Bill } from "./bills-panel"

function formatCurrencyExact(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function BillItem({
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
