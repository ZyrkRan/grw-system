"use client"

import { useState } from "react"
import { ChevronDown, Wrench } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ServiceForm } from "@/components/services/service-form"
import { cn } from "@/lib/utils"

export function QuickServiceLog({
  onSuccess,
}: {
  onSuccess?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [resetKey, setResetKey] = useState(0)

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
