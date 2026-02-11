export type DueStatus = "on-track" | "due-soon" | "due-today" | "late" | null

export interface DueDateInfo {
  nextDueDate: string | null
  daysUntilDue: number | null
  dueStatus: DueStatus
}

export function computeDueDateInfo(
  lastServiceDate: string | Date | null | undefined,
  serviceInterval: number | null | undefined
): DueDateInfo {
  if (!lastServiceDate || !serviceInterval) {
    return { nextDueDate: null, daysUntilDue: null, dueStatus: null }
  }

  const last = new Date(lastServiceDate)
  const next = new Date(last)
  next.setDate(next.getDate() + serviceInterval)

  // Compare dates only (no time component)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  next.setHours(0, 0, 0, 0)

  const diffMs = next.getTime() - today.getTime()
  const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24))

  let dueStatus: DueStatus
  if (daysUntilDue < 0) {
    dueStatus = "late"
  } else if (daysUntilDue === 0) {
    dueStatus = "due-today"
  } else if (daysUntilDue <= 7) {
    dueStatus = "due-soon"
  } else {
    dueStatus = "on-track"
  }

  return {
    nextDueDate: next.toISOString(),
    daysUntilDue,
    dueStatus,
  }
}

export function getDueStatusLabel(
  daysUntilDue: number | null,
  dueStatus: DueStatus
): string | null {
  if (dueStatus === null || daysUntilDue === null) return null

  switch (dueStatus) {
    case "late":
      return `Late (${Math.abs(daysUntilDue)} days)`
    case "due-today":
      return "Due today"
    case "due-soon":
    case "on-track":
      return `Due in ${daysUntilDue} days`
  }
}
