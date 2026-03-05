"use client"

import { useEffect, useState } from "react"
import { MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { DynamicCustomerMap } from "@/components/map/dynamic-imports"

interface Customer {
  id: number
  name: string
  address: string
  latitude: number | null
  longitude: number | null
}

export default function MapPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/customers")
      .then((res) => res.json())
      .then((result) => {
        if (result.success) setCustomers(result.data)
      })
      .finally(() => setLoading(false))
  }, [])

  const mapped = customers.filter((c) => c.latitude != null && c.longitude != null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Map</h1>
          {!loading && (
            <Badge variant="secondary" className="gap-1">
              <MapPin className="size-3" />
              {mapped.length} of {customers.length} customers mapped
            </Badge>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[calc(100vh-12rem)] w-full rounded-md" />
      ) : mapped.length === 0 ? (
        <div className="flex h-[calc(100vh-12rem)] items-center justify-center rounded-md border border-dashed">
          <div className="text-center">
            <MapPin className="mx-auto size-10 text-muted-foreground" />
            <h3 className="mt-3 text-lg font-medium">No locations set</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Edit a customer and drop a pin on the map to see them here.
            </p>
          </div>
        </div>
      ) : (
        <DynamicCustomerMap
          customers={customers}
          height="calc(100vh - 12rem)"
        />
      )}
    </div>
  )
}
