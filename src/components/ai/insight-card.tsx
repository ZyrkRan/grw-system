"use client"

import { useState, useEffect } from "react"
import { Sparkles, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { MarkdownContent } from "@/components/ai/markdown-content"

interface InsightCardProps {
  title: string
  icon: React.ReactNode
  section: string
  data: any
  children: React.ReactNode
}

export function InsightCard({ title, icon, section, data, children }: InsightCardProps) {
  const [interpretation, setInterpretation] = useState<string | null>(null)
  const [isInterpreting, setIsInterpreting] = useState(false)
  const [interpretError, setInterpretError] = useState(false)

  useEffect(() => {
    if (!data) return

    async function fetchInterpretation() {
      setIsInterpreting(true)
      setInterpretError(false)
      try {
        const res = await fetch("/api/ai/interpret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, section }),
        })
        const result = await res.json()
        if (result.success) {
          setInterpretation(result.data.interpretation)
        } else {
          setInterpretError(true)
        }
      } catch {
        setInterpretError(true)
      } finally {
        setIsInterpreting(false)
      }
    }

    fetchInterpretation()
  }, [data, section])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}

        {/* AI Interpretation */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3" />
            AI Insight
          </div>
          {isInterpreting ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Analyzing...
            </div>
          ) : interpretError ? (
            <p className="text-xs text-muted-foreground">
              AI analysis unavailable. Check Ollama connection in Settings.
            </p>
          ) : interpretation ? (
            <MarkdownContent content={interpretation} className="text-sm" />
          ) : (
            <Skeleton className="h-10 w-full" />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
