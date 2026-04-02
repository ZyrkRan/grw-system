"use client"

import { useState } from "react"
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react"
import { parse, isValid } from "date-fns"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasExistingData: boolean
  onSuccess: (stats: { imported: number; autoCategorized: number }) => void
}

type TxType = "INFLOW" | "OUTFLOW"

interface ParsedRow {
  date?: Date
  description?: string
  amount?: number
  type?: TxType
  merchantName?: string
  errors: string[]
}

interface ColumnMapping {
  date?: number
  description?: number
  amount?: number
  debit?: number
  credit?: number
  type?: number
  merchantName?: number
}

const DATE_FORMATS = ["MM/dd/yyyy", "yyyy-MM-dd", "dd/MM/yyyy", "M/d/yyyy", "yyyy/MM/dd"]

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error("CSV must have at least a header row and one data row")

  const parsedLines = lines.map((line) => {
    const cells: string[] = []
    let current = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') inQuotes = !inQuotes
      else if (ch === "," && !inQuotes) { cells.push(current.trim()); current = "" }
      else current += ch
    }
    cells.push(current.trim())
    return cells
  })

  return { headers: parsedLines[0], rows: parsedLines.slice(1) }
}

function autoDetect(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase().trim())
  const detected: ColumnMapping = {}
  const used = new Set<number>()

  const find = (patterns: RegExp[]) => {
    for (const p of patterns)
      for (let i = 0; i < lower.length; i++)
        if (!used.has(i) && p.test(lower[i])) return i
    return undefined
  }

  detected.date = find([/^date$/, /transaction.?date/, /posted.?date/, /date/, /posted/])
  if (detected.date !== undefined) used.add(detected.date)

  detected.description = find([/^description$/, /^memo$/, /description/, /memo/, /detail/, /narrative/, /particulars/])
  if (detected.description !== undefined) used.add(detected.description)

  const amountIdx = find([/^amount$/, /transaction.?amount/, /net.?amount/, /amount/])
  const debitIdx = find([/^debit$/, /debit.?amount/, /^withdrawal$/, /debit/, /withdrawal/])
  const creditIdx = find([/^credit$/, /credit.?amount/, /^deposit$/, /credit/, /deposit/])

  if (amountIdx !== undefined) {
    detected.amount = amountIdx
    used.add(amountIdx)
  } else if (debitIdx !== undefined && creditIdx !== undefined) {
    detected.debit = debitIdx; detected.credit = creditIdx
    used.add(debitIdx); used.add(creditIdx)
  }

  detected.type = find([/^type$/, /transaction.?type/, /type/])
  if (detected.type !== undefined) used.add(detected.type)
  detected.merchantName = find([/^merchant$/, /merchant.?name/, /^payee$/, /^vendor$/, /merchant/, /payee/, /vendor/])

  return detected
}

function parseDate(s: string): Date | null {
  for (const fmt of DATE_FORMATS) {
    try { const d = parse(s, fmt, new Date()); if (isValid(d)) return d } catch { /* next */ }
  }
  return null
}

function parseAmount(amountStr: string, debitStr?: string, creditStr?: string): { amount: number; type: TxType } | null {
  if (debitStr !== undefined || creditStr !== undefined) {
    const debit = debitStr ? parseFloat(debitStr.replace(/[^0-9.-]/g, "")) : 0
    const credit = creditStr ? parseFloat(creditStr.replace(/[^0-9.-]/g, "")) : 0
    if (!isNaN(debit) && debit > 0) return { amount: debit, type: "OUTFLOW" }
    if (!isNaN(credit) && credit > 0) return { amount: credit, type: "INFLOW" }
    return null
  }
  if (!amountStr) return null
  const n = parseFloat(amountStr.replace(/[^0-9.-]/g, ""))
  if (isNaN(n)) return null
  return { amount: Math.abs(n), type: n < 0 ? "OUTFLOW" : "INFLOW" }
}

function buildRows(m: ColumnMapping, rows: string[][]): ParsedRow[] {
  return rows.map((row) => {
    const r: ParsedRow = { errors: [] }

    if (m.date !== undefined) {
      const d = parseDate(row[m.date] || "")
      if (!d) r.errors.push("Invalid date")
      else r.date = d
    } else r.errors.push("Date missing")

    if (m.description !== undefined) r.description = row[m.description] || ""
    else r.errors.push("Description missing")

    const amtResult = parseAmount(
      m.amount !== undefined ? row[m.amount] || "" : "",
      m.debit !== undefined ? row[m.debit] : undefined,
      m.credit !== undefined ? row[m.credit] : undefined
    )
    if (!amtResult) r.errors.push("Invalid amount")
    else { r.amount = amtResult.amount; r.type = amtResult.type }

    if (m.merchantName !== undefined) r.merchantName = row[m.merchantName] || undefined

    // Override type if explicit column exists
    if (m.type !== undefined && row[m.type]) {
      const raw = row[m.type].toUpperCase()
      if (raw.includes("CREDIT") || raw.includes("INFLOW") || raw.includes("DEPOSIT")) r.type = "INFLOW"
      else if (raw.includes("DEBIT") || raw.includes("OUTFLOW") || raw.includes("WITHDRAWAL")) r.type = "OUTFLOW"
    }

    return r
  })
}

export function CsvUploadDialog({ open, onOpenChange, hasExistingData, onSuccess }: Props) {
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload")
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  function reset() {
    setStep("upload"); setHeaders([]); setRawRows([]); setMapping({}); setParsedRows([]); setError("")
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError("")
    try {
      const text = await file.text()
      const { headers: h, rows: r } = parseCSV(text)
      setHeaders(h); setRawRows(r)
      const detected = autoDetect(h)
      setMapping(detected)
      const hasRequired = detected.date !== undefined && detected.description !== undefined &&
        (detected.amount !== undefined || (detected.debit !== undefined && detected.credit !== undefined))
      const built = buildRows(detected, r)
      setParsedRows(built)
      setStep(hasRequired ? "preview" : "map")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse CSV")
    }
  }

  function applyMapping(m: ColumnMapping) {
    setMapping(m)
    setParsedRows(buildRows(m, rawRows))
    setStep("preview")
  }

  const validRows = parsedRows.filter((r) => r.errors.length === 0)
  const errorCount = parsedRows.length - validRows.length

  async function handleImport() {
    setSubmitting(true)
    try {
      const transactions = validRows.map((r) => ({
        date: r.date!.toISOString(),
        description: r.description!,
        merchantName: r.merchantName,
        amount: r.amount!,
        type: r.type!,
      }))

      const res = await fetch("/api/tax/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions }),
      })
      if (!res.ok && res.status === 413) throw new Error("File too large — try splitting into smaller batches")
      const data = await res.json()
      if (!data.success) throw new Error(data.error || `Server error ${res.status}`)

      onSuccess({ imported: data.data.imported, autoCategorized: data.data.autoCategorized })
      onOpenChange(false)
      setTimeout(reset, 300)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setSubmitting(false)
    }
  }

  const NONE = "__none__"

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setTimeout(reset, 300) }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload CSV</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload your bank export CSV file for 2025."}
            {step === "map" && "Map the CSV columns to the required fields."}
            {step === "preview" && `Preview: ${validRows.length} valid transactions${errorCount > 0 ? `, ${errorCount} will be skipped` : ""}.`}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          {(["upload", "map", "preview"] as const).map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              {i > 0 && <span>›</span>}
              <span className={step === s ? "text-foreground font-medium" : ""}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
            </span>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded p-2">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {hasExistingData && step === "upload" && (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
            <RefreshCw className="size-4 shrink-0" />
            Re-uploading will replace all existing transactions.
          </div>
        )}

        {/* ── Upload Step ── */}
        {step === "upload" && (
          <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/50 transition-colors">
            <Upload className="size-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Click to select CSV file</p>
            <p className="text-xs text-muted-foreground mt-1">Supports most bank export formats</p>
            <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
        )}

        {/* ── Map Step ── */}
        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Some columns couldn&apos;t be auto-detected. Please map them manually.</p>
            {(["date", "description", "amount", "debit", "credit", "type", "merchantName"] as const).map((field) => (
              <div key={field} className="grid grid-cols-2 items-center gap-4">
                <Label className="capitalize">{field === "merchantName" ? "Merchant Name (optional)" : field === "debit" ? "Debit Column (optional)" : field === "credit" ? "Credit Column (optional)" : field === "type" ? "Type Column (optional)" : field}</Label>
                <Select
                  value={mapping[field] !== undefined ? String(mapping[field]) : NONE}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v === NONE ? undefined : Number(v) }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— None —</SelectItem>
                    {headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={() => applyMapping(mapping)}>Preview</Button>
            </div>
          </div>
        )}

        {/* ── Preview Step ── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />{validRows.length} valid
              </span>
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="size-4" />{errorCount} skipped
                </span>
              )}
            </div>

            <div className="rounded border overflow-hidden max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 50).map((row, i) => (
                    <TableRow key={i} className={row.errors.length > 0 ? "opacity-40" : ""}>
                      <TableCell className="text-xs">{row.date ? row.date.toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{row.description || "—"}</TableCell>
                      <TableCell className="text-xs">{row.merchantName || "—"}</TableCell>
                      <TableCell className="text-xs text-right">{row.amount !== undefined ? `$${row.amount.toFixed(2)}` : "—"}</TableCell>
                      <TableCell>
                        {row.type && (
                          <Badge variant={row.type === "INFLOW" ? "default" : "secondary"} className="text-xs">
                            {row.type === "INFLOW" ? "In" : "Out"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.errors.length > 0
                          ? <span className="text-xs text-destructive">{row.errors[0]}</span>
                          : <CheckCircle2 className="size-3 text-emerald-500" />
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsedRows.length > 50 && <p className="text-xs text-muted-foreground text-center">Showing first 50 of {parsedRows.length}</p>}

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => { setStep("upload"); reset() }}>
                <FileText className="size-4 mr-1" /> Change file
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("map")}>Edit mapping</Button>
                <Button onClick={handleImport} disabled={submitting || validRows.length === 0}>
                  {submitting ? <><Loader2 className="size-4 mr-2 animate-spin" />Importing…</> : `Import ${validRows.length} transactions`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
