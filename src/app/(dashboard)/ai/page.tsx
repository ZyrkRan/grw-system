"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const InsightsDashboard = dynamic(() => import("@/components/ai/insights-dashboard").then((m) => m.InsightsDashboard))
const ChatPanel = dynamic(() => import("@/components/ai/chat-panel").then((m) => m.ChatPanel))

type Tab = "insights" | "chat"

export default function AIPage() {
  const [activeTab, setActiveTab] = useState<Tab>("insights")

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">AI Insights</h1>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        <Button
          variant="ghost"
          className={cn(
            "rounded-none border-b-2 px-4 py-2",
            activeTab === "insights"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("insights")}
        >
          Insights
        </Button>
        <Button
          variant="ghost"
          className={cn(
            "rounded-none border-b-2 px-4 py-2",
            activeTab === "chat"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </Button>
      </div>

      {activeTab === "insights" && <InsightsDashboard />}
      {activeTab === "chat" && <ChatPanel embedded />}
    </div>
  )
}
