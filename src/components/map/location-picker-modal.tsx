"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { MapPin } from "lucide-react"
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

  // Sync draft when modal opens
  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="flex flex-1 min-h-0">
          {/* Map — takes all available width */}
          <div className="flex-1 min-w-0">
            <LocationPicker value={draft} onChange={setDraft} height="100%" />
          </div>

          {/* Sidebar panel */}
          <div className="w-64 shrink-0 border-l flex flex-col justify-between p-5">
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>Set Location</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Click anywhere on the map to drop a pin.
              </p>
              {draft ? (
                <div className="rounded-md border bg-muted/50 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MapPin className="size-3.5 text-primary" />
                    Pin placed
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {draft.lat.toFixed(6)}, {draft.lng.toFixed(6)}
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-3">
                  <p className="text-xs text-muted-foreground text-center">
                    No pin placed yet
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-2 pt-4">
              <Button
                className="w-full"
                onClick={() => {
                  onConfirm(draft)
                  onOpenChange(false)
                }}
              >
                Confirm Location
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
