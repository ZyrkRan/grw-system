"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Square, Trash2, Sparkles, User, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAIChat, type ChatMessage } from "@/hooks/use-ai-chat"
import { MarkdownContent } from "@/components/ai/markdown-content"

const SUGGESTED_PROMPTS = [
  "What did I spend the most on this month?",
  "Show me my personal vs business split",
  "What are my recurring charges?",
  "How can I reduce my spending?",
  "What's my debt payoff timeline?",
  "Which categories are growing the fastest?",
]

interface ChatPanelProps {
  embedded?: boolean
}

export function ChatPanel({ embedded = false }: ChatPanelProps) {
  const { messages, isStreaming, error, sendMessage, stopStreaming, clearChat } = useAIChat()
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    sendMessage(input)
    setInput("")
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  function handleSuggestionClick(prompt: string) {
    sendMessage(prompt)
  }

  return (
    <div className={cn(
      "flex flex-col",
      embedded ? "h-[calc(100vh-16rem)]" : "h-full"
    )}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-6">
            <div className="flex items-center justify-center size-12 rounded-full bg-primary/10">
              <Sparkles className="size-6 text-primary" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="font-semibold">AI Financial Assistant</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Ask me about your spending habits, budget, debt payoff strategy, or anything about your financial data.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSuggestionClick(prompt)}
                  className="text-left rounded-lg border p-3 text-sm hover:bg-accent transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-4 space-y-2">
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your finances..."
              rows={1}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              disabled={isStreaming}
            />
          </div>
          <div className="flex gap-1">
            {isStreaming ? (
              <Button type="button" size="icon" variant="outline" onClick={stopStreaming}>
                <Square className="size-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()}>
                <Send className="size-4" />
              </Button>
            )}
            {messages.length > 0 && !isStreaming && (
              <Button type="button" size="icon" variant="ghost" onClick={clearChat}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <div className={cn(
        "flex items-center justify-center size-7 rounded-full shrink-0",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      )}>
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </div>
      <div className={cn(
        "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-muted rounded-tl-sm"
      )}>
        {message.content ? (
          isUser ? message.content : <MarkdownContent content={message.content} />
        ) : (
          <span className="inline-flex gap-1">
            <span className="size-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="size-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="size-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        )}
      </div>
    </div>
  )
}
