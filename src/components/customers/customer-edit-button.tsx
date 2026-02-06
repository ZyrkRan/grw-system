"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CustomerDialog } from "@/components/customers/customer-dialog"

interface CustomerData {
  id: number
  name: string
  phone: string
  email: string | null
  address: string
  serviceInterval: number | null
}

interface CustomerEditButtonProps {
  customer: CustomerData
}

export function CustomerEditButton({ customer }: CustomerEditButtonProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)

  function handleSuccess() {
    router.refresh()
  }

  return (
    <>
      <Button variant="outline" onClick={() => setDialogOpen(true)}>
        <Pencil className="mr-2 size-4" />
        Edit
      </Button>
      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={customer}
        onSuccess={handleSuccess}
      />
    </>
  )
}
