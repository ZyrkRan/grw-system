import { Badge } from "@/components/ui/badge"
import { getDueStatusLabel, type DueStatus } from "@/lib/due-date"
import { cn } from "@/lib/utils"

interface DueStatusBadgeProps {
  daysUntilDue: number | null
  dueStatus: DueStatus
  className?: string
}

export function DueStatusBadge({
  daysUntilDue,
  dueStatus,
  className,
}: DueStatusBadgeProps) {
  const label = getDueStatusLabel(daysUntilDue, dueStatus)
  if (!label) return null

  return (
    <Badge
      variant={dueStatus === "late" ? "destructive" : "outline"}
      className={cn(
        dueStatus === "due-today" && "border-amber-500 bg-amber-500/10 text-amber-600",
        dueStatus === "due-soon" && "border-amber-500 text-amber-600",
        dueStatus === "on-track" && "text-muted-foreground",
        className
      )}
    >
      {label}
    </Badge>
  )
}
