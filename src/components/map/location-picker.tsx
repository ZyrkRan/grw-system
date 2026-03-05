"use client"

import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { fixLeafletIcons } from "./fix-leaflet-icons"
import "leaflet/dist/leaflet.css"

fixLeafletIcons()

interface LatLng {
  lat: number
  lng: number
}

interface LocationPickerProps {
  value: LatLng | null
  onChange: (coords: LatLng | null) => void
  height?: string
}

function ClickHandler({ onChange }: { onChange: (coords: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

// Puerto Rico default center
const PR_CENTER: LatLng = { lat: 18.2208, lng: -66.5901 }

export function LocationPicker({ value, onChange, height = "200px" }: LocationPickerProps) {
  const center = value ?? PR_CENTER
  const zoom = value ? 15 : 9

  return (
    <div className="relative" style={{ height }}>
      <MapContainer
        key={value ? `${value.lat},${value.lng}` : "default"}
        center={[center.lat, center.lng]}
        zoom={zoom}
        className="h-full w-full rounded-md border z-0"
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickHandler onChange={onChange} />
        {value && <Marker position={[value.lat, value.lng]} />}
      </MapContainer>
      {value && (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute top-2 right-2 z-[1000] size-7"
          onClick={() => onChange(null)}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  )
}
