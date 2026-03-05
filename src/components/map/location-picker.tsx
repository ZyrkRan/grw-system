"use client"

import { useEffect } from "react"
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet"
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

function RecenterMap({ center }: { center: LatLng }) {
  const map = useMap()
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom())
  }, [map, center.lat, center.lng])
  return null
}

export function LocationPicker({ value, onChange, height = "200px" }: LocationPickerProps) {
  const defaultCenter: LatLng = { lat: 29.7604, lng: -95.3698 } // Houston, TX
  const center = value ?? defaultCenter
  const zoom = value ? 15 : 5

  return (
    <div className="relative" style={{ height }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        className="h-full w-full rounded-md border z-0"
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickHandler onChange={onChange} />
        {value && (
          <>
            <Marker position={[value.lat, value.lng]} />
            <RecenterMap center={value} />
          </>
        )}
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
