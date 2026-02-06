"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ServiceLogTable } from "@/components/services/service-log-table"
import { ServiceTypes } from "@/app/(dashboard)/services/service-types"

type Tab = "log" | "types"

export default function ServicesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("log")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Services</h1>
      </div>

      <div className="flex gap-1 border-b">
        <Button
          variant="ghost"
          className={cn(
            "rounded-none border-b-2 px-4 py-2",
            activeTab === "log"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("log")}
        >
          Service Log
        </Button>
        <Button
          variant="ghost"
          className={cn(
            "rounded-none border-b-2 px-4 py-2",
            activeTab === "types"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("types")}
        >
          Service Types
        </Button>
      </div>

      {activeTab === "log" && <ServiceLogTable />}
      {activeTab === "types" && <ServiceTypes />}
    </div>
  )
}
