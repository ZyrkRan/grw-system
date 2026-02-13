"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  Plus,
  Pencil,
  Loader2,
  Calendar,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RouteDialog } from "@/components/routes/route-dialog"
import { RouteCustomerList } from "@/components/routes/route-customer-list"
import { AddCustomerToRouteDialog } from "@/components/routes/add-customer-to-route-dialog"

interface RouteCustomerData {
  id: number
  position: number
  customer: {
    id: number
    name: string
    phone: string
    address: string
    email: string | null
    isVip: boolean
  }
}

interface RouteDetail {
  id: number
  name: string
  description: string | null
  color: string | null
  date: string | null
  customers: RouteCustomerData[]
}

export default function RouteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const routeId = parseInt(params.id as string, 10)

  const [route, setRoute] = useState<RouteDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)

  const fetchRoute = useCallback(async () => {
    try {
      const res = await fetch(`/api/routes/${routeId}`)
      const result = await res.json()
      if (result.success) {
        setRoute(result.data)
      }
    } catch (error) {
      console.error("Failed to fetch route:", error)
    } finally {
      setIsLoading(false)
    }
  }, [routeId])

  useEffect(() => {
    fetchRoute()
  }, [fetchRoute])

  function handleReorder(reorderedCustomers: RouteCustomerData[]) {
    if (!route) return
    setRoute({ ...route, customers: reorderedCustomers })
  }

  async function handleRemoveCustomer(routeCustomerId: number, customerId: number) {
    if (!route) return

    const prev = route.customers
    setRoute({
      ...route,
      customers: route.customers.filter((c) => c.id !== routeCustomerId),
    })

    try {
      const res = await fetch(
        `/api/routes/${routeId}/customers/${customerId}`,
        { method: "DELETE" }
      )
      const result = await res.json()
      if (!result.success) {
        setRoute({ ...route, customers: prev })
      }
    } catch {
      setRoute({ ...route, customers: prev })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!route) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push("/routes")}>
          <ArrowLeft className="mr-2 size-4" />
          Back to Routes
        </Button>
        <p className="text-muted-foreground">Route not found.</p>
      </div>
    )
  }

  const existingCustomerIds = route.customers.map((rc) => rc.customer.id)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/routes")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {route.color && (
              <span
                className="inline-block size-4 rounded-full shrink-0"
                style={{ backgroundColor: route.color }}
              />
            )}
            <h1 className="text-3xl font-bold">{route.name}</h1>
          </div>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            {route.description && <span>{route.description}</span>}
            {route.date ? (
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                {new Date(route.date).toLocaleDateString()}
              </span>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Template
              </Badge>
            )}
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {route.customers.length} stop{route.customers.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
          <Pencil className="mr-2 size-4" />
          Edit
        </Button>
        <Button onClick={() => setAddCustomerOpen(true)}>
          <Plus className="mr-2 size-4" />
          Add Customer
        </Button>
      </div>

      <RouteCustomerList
        routeId={routeId}
        customers={route.customers}
        onReorder={handleReorder}
        onRemove={handleRemoveCustomer}
      />

      <RouteDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        route={route}
        onSuccess={() => {
          fetchRoute()
        }}
      />

      <AddCustomerToRouteDialog
        open={addCustomerOpen}
        onOpenChange={setAddCustomerOpen}
        routeId={routeId}
        existingCustomerIds={existingCustomerIds}
        onSuccess={fetchRoute}
      />
    </div>
  )
}
