"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2, Maximize2 } from "lucide-react"
import {
  DynamicLocationPicker,
  DynamicLocationPickerModal,
} from "@/components/map/dynamic-imports"

interface CustomerData {
  id?: number
  name: string
  phone: string
  email: string | null
  address: string
  latitude?: number | null
  longitude?: number | null
  serviceInterval: number | null
  isVip?: boolean
}

interface CustomerFormProps {
  customer?: CustomerData
  onSuccess: () => void
}

export function CustomerForm({ customer, onSuccess }: CustomerFormProps) {
  const [name, setName] = useState(customer?.name ?? "")
  const [phone, setPhone] = useState(customer?.phone ?? "")
  const [email, setEmail] = useState(customer?.email ?? "")
  const [address, setAddress] = useState(customer?.address ?? "")
  const [serviceInterval, setServiceInterval] = useState(
    customer?.serviceInterval?.toString() ?? ""
  )
  const [isVip, setIsVip] = useState(customer?.isVip ?? false)
  const [latitude, setLatitude] = useState<number | null>(customer?.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(customer?.longitude ?? null)
  const [mapModalOpen, setMapModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const coords = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null

  const isEditing = !!customer?.id

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!name.trim() || !phone.trim() || !address.trim()) {
      setError("Name, phone, and address are required.")
      return
    }

    setIsSubmitting(true)

    try {
      const url = isEditing
        ? `/api/customers/${customer.id}`
        : "/api/customers"

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          address: address.trim(),
          serviceInterval: serviceInterval ? parseInt(serviceInterval, 10) : null,
          isVip,
          latitude,
          longitude,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        setError(result.error || "Something went wrong.")
        return
      }

      onSuccess()
    } catch {
      setError("Failed to save customer. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Customer name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone *</Label>
        <Input
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="customer@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address *</Label>
        <Input
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, City, ST 12345"
          required
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Location</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMapModalOpen(true)}
          >
            <Maximize2 className="mr-1 size-3" />
            Expand
          </Button>
        </div>
        <DynamicLocationPicker
          value={coords}
          onChange={(c) => {
            setLatitude(c?.lat ?? null)
            setLongitude(c?.lng ?? null)
          }}
          height="200px"
        />
        {coords && (
          <p className="text-xs text-muted-foreground">
            {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
          </p>
        )}
        <DynamicLocationPickerModal
          open={mapModalOpen}
          onOpenChange={setMapModalOpen}
          value={coords}
          onConfirm={(c) => {
            setLatitude(c?.lat ?? null)
            setLongitude(c?.lng ?? null)
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="serviceInterval">Service Interval (days)</Label>
        <Input
          id="serviceInterval"
          type="number"
          min="1"
          value={serviceInterval}
          onChange={(e) => setServiceInterval(e.target.value)}
          placeholder="e.g. 30"
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch id="isVip" checked={isVip} onCheckedChange={setIsVip} />
        <Label htmlFor="isVip">VIP Customer</Label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isEditing ? "Save Changes" : "Add Customer"}
        </Button>
      </div>
    </form>
  )
}
