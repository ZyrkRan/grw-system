"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RouteForm } from "@/components/routes/route-form"

interface RouteData {
  id?: number
  name: string
  description: string | null
  color: string | null
  date: string | null
}

interface RouteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  route?: RouteData
  onSuccess: () => void
}

export function RouteDialog({
  open,
  onOpenChange,
  route,
  onSuccess,
}: RouteDialogProps) {
  const isEditing = !!route?.id

  function handleSuccess() {
    onOpenChange(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Route" : "Add Route"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the route details below."
              : "Create a new route to group customers for servicing."}
          </DialogDescription>
        </DialogHeader>
        <RouteForm route={route} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  )
}
