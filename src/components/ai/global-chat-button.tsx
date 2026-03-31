"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

const ChatPanel = dynamic(() => import("./chat-panel").then((m) => m.ChatPanel))

export function GlobalChatButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="size-9"
      >
        <Sparkles className="size-4" />
        <span className="sr-only">AI Chat</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="size-4" />
              AI Assistant
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0">
            <ChatPanel />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
