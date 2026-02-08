"use client"

import { useState } from "react"
import { icons } from "lucide-react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { LucideIcon } from "@/components/ui/lucide-icon"
import { ScrollArea } from "@/components/ui/scroll-area"

const CURATED_ICONS = [
  // Lawn / Garden
  "Leaf", "Trees", "Flower2", "Sprout", "Scissors", "Sun", "CloudRain",
  // Cleaning
  "Sparkles", "SprayCan", "Droplets", "Trash2", "Wind",
  // Tools / Maintenance
  "Wrench", "Hammer", "PaintBucket", "Paintbrush", "Drill", "Cog", "Settings",
  // Home
  "Home", "DoorOpen", "Building", "Warehouse", "Fence",
  // Vehicle
  "Car", "Truck",
  // Misc
  "Zap", "Flame", "Snowflake", "Bug", "Shield", "Star", "Heart",
  "Clock", "Calendar", "MapPin", "Package", "CircleDot", "Shovel", "Brush",
] as const

// Convert PascalCase to kebab-case for storage
function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
}

// Convert kebab-case to PascalCase for lookup
function toPascalCase(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

interface IconPickerProps {
  value: string
  onChange: (value: string) => void
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filteredIcons = search
    ? CURATED_ICONS.filter((name) =>
        name.toLowerCase().includes(search.toLowerCase())
      )
    : CURATED_ICONS

  const selectedPascal = value ? toPascalCase(value) : ""

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2 font-normal"
        >
          {value && icons[selectedPascal as keyof typeof icons] ? (
            <>
              <LucideIcon name={value} className="size-4" />
              <span>{value}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Choose icon</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search icons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
            />
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => {
                  onChange("")
                  setOpen(false)
                }}
              >
                <X className="size-4" />
                <span className="sr-only">Clear icon</span>
              </Button>
            )}
          </div>
          <ScrollArea className="h-56">
            <div className="grid grid-cols-6 gap-1">
              {filteredIcons.map((name) => {
                const kebab = toKebabCase(name)
                const isSelected = value === kebab
                return (
                  <Button
                    key={name}
                    type="button"
                    variant={isSelected ? "default" : "ghost"}
                    size="icon"
                    className="size-10"
                    title={name}
                    onClick={() => {
                      onChange(kebab)
                      setOpen(false)
                      setSearch("")
                    }}
                  >
                    <LucideIcon name={kebab} className="size-5" />
                  </Button>
                )
              })}
            </div>
            {filteredIcons.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No icons match your search.
              </p>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
}
