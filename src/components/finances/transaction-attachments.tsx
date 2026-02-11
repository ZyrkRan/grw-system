"use client"

import { useState, useRef, useCallback } from "react"
import {
  Loader2,
  Upload,
  X,
  FileText,
  ImageIcon,
  Info,
  Paperclip,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ATTACHMENT_MAX_SIZE,
  ATTACHMENT_ALLOWED_TYPES,
  ATTACHMENT_MAX_COUNT,
} from "@/lib/validations/finances"

interface Attachment {
  id: number
  fileName: string
  fileType: string
  fileSize: number
  url: string
  createdAt: string
}

interface TransactionAttachmentsProps {
  transactionId: number
  attachments: Attachment[]
  onAttachmentsChange: (attachments: Attachment[]) => void
  promptMessage?: string | null
}

export function TransactionAttachments({
  transactionId,
  attachments,
  onAttachmentsChange,
  promptMessage,
}: TransactionAttachmentsProps) {
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [viewingUrl, setViewingUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      // Reset input so same file can be re-selected
      e.target.value = ""
      setError("")

      if (!ATTACHMENT_ALLOWED_TYPES.includes(file.type as typeof ATTACHMENT_ALLOWED_TYPES[number])) {
        setError("File type not allowed. Use JPEG, PNG, WebP, or PDF.")
        return
      }

      if (file.size > ATTACHMENT_MAX_SIZE) {
        setError("File too large. Maximum size is 5MB.")
        return
      }

      if (attachments.length >= ATTACHMENT_MAX_COUNT) {
        setError(`Maximum ${ATTACHMENT_MAX_COUNT} attachments per transaction.`)
        return
      }

      setUploading(true)

      try {
        const formData = new FormData()
        formData.append("file", file)

        const res = await fetch(
          `/api/finances/transactions/${transactionId}/attachments`,
          { method: "POST", body: formData }
        )

        const result = await res.json()

        if (!result.success) {
          setError(result.error || "Upload failed.")
          return
        }

        onAttachmentsChange([result.data, ...attachments])
      } catch {
        setError("Failed to upload file.")
      } finally {
        setUploading(false)
      }
    },
    [transactionId, attachments, onAttachmentsChange]
  )

  const handleDelete = useCallback(
    async (attachmentId: number) => {
      setDeletingId(attachmentId)
      setError("")

      try {
        const res = await fetch(
          `/api/finances/transactions/${transactionId}/attachments/${attachmentId}`,
          { method: "DELETE" }
        )

        const result = await res.json()

        if (!result.success) {
          setError(result.error || "Delete failed.")
          return
        }

        onAttachmentsChange(attachments.filter((a) => a.id !== attachmentId))
      } catch {
        setError("Failed to delete attachment.")
      } finally {
        setDeletingId(null)
      }
    },
    [transactionId, attachments, onAttachmentsChange]
  )

  const isImage = (type: string) => type.startsWith("image/")

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="size-4" />
          Attachments
          {attachments.length > 0 && (
            <span className="text-muted-foreground">({attachments.length})</span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || attachments.length >= ATTACHMENT_MAX_COUNT}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1.5 size-3.5" />
          )}
          {uploading ? "Uploading..." : "Upload"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={ATTACHMENT_ALLOWED_TYPES.join(",")}
          onChange={handleFileSelect}
        />
      </div>

      {/* Prompt banner */}
      {promptMessage && attachments.length === 0 && (
        <div className="flex items-start gap-2 rounded-md bg-blue-500/10 px-3 py-2 text-sm text-blue-600 dark:text-blue-400">
          <Info className="size-4 mt-0.5 shrink-0" />
          {promptMessage}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Attachment grid */}
      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="group relative rounded-md border bg-muted/50 overflow-hidden"
            >
              {isImage(att.fileType) ? (
                <button
                  type="button"
                  className="block w-full aspect-square"
                  onClick={() => setViewingUrl(att.url)}
                >
                  <img
                    src={att.url}
                    alt={att.fileName}
                    className="size-full object-cover"
                  />
                </button>
              ) : (
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center gap-1 aspect-square p-2"
                >
                  <FileText className="size-8 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                    {att.fileName}
                  </span>
                </a>
              )}

              {/* Delete button */}
              <button
                type="button"
                className={cn(
                  "absolute top-1 right-1 rounded-full bg-background/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground",
                  deletingId === att.id && "opacity-100"
                )}
                onClick={() => handleDelete(att.id)}
                disabled={deletingId === att.id}
              >
                {deletingId === att.id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <X className="size-3" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {viewingUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setViewingUrl(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-background/80 p-2 hover:bg-background"
            onClick={() => setViewingUrl(null)}
          >
            <X className="size-5" />
          </button>
          <img
            src={viewingUrl}
            alt="Attachment preview"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
