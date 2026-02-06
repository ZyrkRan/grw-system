"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CustomerForm } from "@/components/customers/customer-form"

interface CustomerData {
  id?: number
  name: string
  phone: string
  email: string | null
  address: string
  serviceInterval: number | null
}

interface CustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: CustomerData
  onSuccess: () => void
}

export function CustomerDialog({
  open,
  onOpenChange,
  customer,
  onSuccess,
}: CustomerDialogProps) {
  const isEditing = !!customer?.id

  function handleSuccess() {
    onOpenChange(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Customer" : "Add Customer"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the customer details below."
              : "Fill in the details to add a new customer."}
          </DialogDescription>
        </DialogHeader>
        <CustomerForm customer={customer} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  )
}
