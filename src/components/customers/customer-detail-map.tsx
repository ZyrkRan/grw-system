"use client"

import { DynamicCustomerMap } from "@/components/map/dynamic-imports"

interface CustomerDetailMapProps {
  customer: {
    id: number
    name: string
    address: string
    latitude: number
    longitude: number
  }
}

export function CustomerDetailMap({ customer }: CustomerDetailMapProps) {
  return (
    <DynamicCustomerMap
      customers={[customer]}
      height="250px"
      zoom={15}
      center={[customer.latitude, customer.longitude]}
    />
  )
}
