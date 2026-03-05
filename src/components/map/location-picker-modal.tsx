"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LocationPicker } from "./location-picker"

interface LatLng {
  lat: number
  lng: number
}

interface LocationPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: LatLng | null
  onConfirm: (coords: LatLng | null) => void
}

export function LocationPickerModal({
  open,
  onOpenChange,
  value,
  onConfirm,
}: LocationPickerModalProps) {
  const [draft, setDraft] = useState<LatLng | null>(value)

  function handleOpenChange(next: boolean) {
    if (next) setDraft(value)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Set Customer Location</DialogTitle>
        </DialogHeader>
        <LocationPicker value={draft} onChange={setDraft} height="450px" />
        {draft && (
          <p className="text-xs text-muted-foreground">
            {draft.lat.toFixed(6)}, {draft.lng.toFixed(6)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(draft)
              onOpenChange(false)
            }}
          >
            Confirm Location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
