"use client"

import { useEffect, useState } from "react"
import { ChevronDown, Wrench } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ServiceForm } from "@/components/services/service-form"
import { cn } from "@/lib/utils"

const LS_QSL_OPEN = "dashboard-quick-service-log-open"

export function QuickServiceLog({
  onSuccess,
}: {
  onSuccess?: () => void
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    const stored = localStorage.getItem(LS_QSL_OPEN)
    return stored === null ? true : stored === "1"
  })

  const [resetKey, setResetKey] = useState(0)

  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem(LS_QSL_OPEN, open ? "1" : "0")
  }, [open])

  return (
    <Card>
      <CardContent>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger
            className="group flex w-full items-center gap-2 text-left"
            aria-label={open ? "Collapse quick add" : "Expand quick add"}
          >
            <Wrench className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Quick Add Service</h3>
            <ChevronDown
              className={cn(
                "ml-auto size-4 text-muted-foreground transition-transform",
                !open && "-rotate-90"
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0">
            <ServiceForm
              defaultStatus="COMPLETE"
              resetKey={resetKey}
              onSuccess={() => {
                setResetKey((k) => k + 1)
                onSuccess?.()
              }}
            />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
