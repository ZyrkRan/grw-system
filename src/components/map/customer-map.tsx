"use client"

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet"
import Link from "next/link"
import { fixLeafletIcons } from "./fix-leaflet-icons"
import "leaflet/dist/leaflet.css"

fixLeafletIcons()

interface CustomerPin {
  id: number
  name: string
  address: string
  latitude: number | null
  longitude: number | null
}

interface CustomerMapProps {
  customers: CustomerPin[]
  height?: string
  zoom?: number
  center?: [number, number]
}

// Puerto Rico default center
const PR_CENTER: [number, number] = [18.2208, -66.5901]

export function CustomerMap({ customers, height = "500px", zoom, center }: CustomerMapProps) {
  const mapped = customers.filter(
    (c): c is CustomerPin & { latitude: number; longitude: number } =>
      c.latitude != null && c.longitude != null
  )

  const defaultCenter: [number, number] = center ??
    (mapped.length === 1
      ? [mapped[0].latitude, mapped[0].longitude]
      : mapped.length > 1
        ? [
            mapped.reduce((sum, c) => sum + c.latitude, 0) / mapped.length,
            mapped.reduce((sum, c) => sum + c.longitude, 0) / mapped.length,
          ]
        : PR_CENTER)

  const defaultZoom = zoom ?? (mapped.length === 1 ? 15 : mapped.length > 1 ? 10 : 9)

  return (
    <div style={{ height }} className="w-full">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="h-full w-full rounded-md border z-0"
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {mapped.map((c) => (
          <Marker key={c.id} position={[c.latitude, c.longitude]}>
            <Popup>
              <div className="space-y-1">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.address}</p>
                <Link
                  href={`/customers/${c.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  View Details
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
