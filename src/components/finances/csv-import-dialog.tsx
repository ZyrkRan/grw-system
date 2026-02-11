"use client"

import { useState, useEffect } from "react"
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react"
import { parse, isValid, isFuture } from "date-fns"
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

interface CSVImportDialogProps {
  accountId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type TransactionType = "INFLOW" | "OUTFLOW"

interface ParsedRow {
  raw: string[]
  date?: Date
  description?: string
  amount?: number
  type?: TransactionType
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

const DATE_FORMATS = [
  "MM/dd/yyyy",
  "yyyy-MM-dd",
  "dd/MM/yyyy",
  "M/d/yyyy",
  "yyyy/MM/dd",
]

export function CSVImportDialog({
  accountId,
  open,
  onOpenChange,
  onSuccess,
}: CSVImportDialogProps) {
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload")
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    if (!open) {
      // Reset all state when dialog closes
      setTimeout(() => {
        setStep("upload")
        setFile(null)
        setHeaders([])
        setRows([])
        setMapping({})
        setParsedRows([])
        setError("")
        setSuccessMessage("")
      }, 200)
    }
  }, [open])

  function parseCSV(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split(/\r?\n/).filter((line) => line.trim())
    if (lines.length < 2) {
      throw new Error("CSV must have at least a header row and one data row")
    }

    const parsedLines = lines.map((line) => {
      const cells: string[] = []
      let current = ""
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]

        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === "," && !inQuotes) {
          cells.push(current.trim())
          current = ""
        } else {
          current += char
        }
      }
      cells.push(current.trim())
      return cells
    })

    return {
      headers: parsedLines[0],
      rows: parsedLines.slice(1),
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setError("")
    setFile(selectedFile)

    try {
      const text = await selectedFile.text()
      const { headers: parsedHeaders, rows: parsedRows } = parseCSV(text)
      setHeaders(parsedHeaders)
      setRows(parsedRows)

      const detected = autoDetectColumns(parsedHeaders)
      setMapping(detected)

      // If required fields are detected, skip straight to preview
      const hasRequired =
        detected.date !== undefined &&
        detected.description !== undefined &&
        (detected.amount !== undefined || (detected.debit !== undefined && detected.credit !== undefined))

      if (hasRequired) {
        const validated = validateAndParseRows(detected, parsedRows)
        setParsedRows(validated)
        setStep("preview")
      } else {
        setStep("map")
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to parse CSV file"
      )
      setFile(null)
    }
  }

  function autoDetectColumns(headers: string[]): ColumnMapping {
    const detected: ColumnMapping = {}
    const lower = headers.map((h) => h.toLowerCase().trim())

    // Score-based matching — each field tries all headers, picks best match
    // Priority: exact-ish match first, then partial includes
    const datePatterns = [/^date$/, /^transaction.?date$/, /^posted.?date$/, /^post.?date$/, /^trans.?date$/, /date/, /posted/]
    const descPatterns = [/^description$/, /^memo$/, /^transaction.?description$/, /description/, /memo/, /detail/, /narrative/, /particulars/]
    const amountPatterns = [/^amount$/, /^transaction.?amount$/, /^net.?amount$/, /amount/]
    const debitPatterns = [/^debit$/, /^debit.?amount$/, /^withdrawal$/, /debit/, /withdrawal/]
    const creditPatterns = [/^credit$/, /^credit.?amount$/, /^deposit$/, /credit/, /deposit/]
    const typePatterns = [/^type$/, /^transaction.?type$/, /^trans.?type$/, /type/]
    const merchantPatterns = [/^merchant$/, /^merchant.?name$/, /^payee$/, /^vendor$/, /merchant/, /payee/, /vendor/]

    function findBest(patterns: RegExp[], exclude?: Set<number>): number | undefined {
      for (const pattern of patterns) {
        for (let i = 0; i < lower.length; i++) {
          if (exclude?.has(i)) continue
          if (pattern.test(lower[i])) return i
        }
      }
      return undefined
    }

    const used = new Set<number>()

    detected.date = findBest(datePatterns, used)
    if (detected.date !== undefined) used.add(detected.date)

    detected.description = findBest(descPatterns, used)
    if (detected.description !== undefined) used.add(detected.description)

    // Try single amount first, then debit/credit
    const amountIdx = findBest(amountPatterns, used)
    const debitIdx = findBest(debitPatterns, used)
    const creditIdx = findBest(creditPatterns, used)

    if (amountIdx !== undefined) {
      detected.amount = amountIdx
      used.add(amountIdx)
    } else if (debitIdx !== undefined && creditIdx !== undefined) {
      detected.debit = debitIdx
      detected.credit = creditIdx
      used.add(debitIdx)
      used.add(creditIdx)
    }

    detected.type = findBest(typePatterns, used)
    if (detected.type !== undefined) used.add(detected.type)

    detected.merchantName = findBest(merchantPatterns, used)

    return detected
  }

  function parseDate(dateStr: string): Date | null {
    if (!dateStr) return null

    for (const format of DATE_FORMATS) {
      try {
        const parsed = parse(dateStr, format, new Date())
        if (isValid(parsed)) {
          return parsed
        }
      } catch {
        // Try next format
      }
    }

    return null
  }

  function parseAmount(
    amountStr: string,
    debitStr?: string,
    creditStr?: string
  ): { amount: number; type: TransactionType } | null {
    // If separate debit/credit columns
    if (debitStr || creditStr) {
      const debit = debitStr
        ? parseFloat(debitStr.replace(/[^0-9.-]/g, ""))
        : 0
      const credit = creditStr
        ? parseFloat(creditStr.replace(/[^0-9.-]/g, ""))
        : 0

      if (!isNaN(debit) && debit > 0) {
        return { amount: debit, type: "OUTFLOW" }
      }
      if (!isNaN(credit) && credit > 0) {
        return { amount: credit, type: "INFLOW" }
      }
      return null
    }

    // Single amount column
    if (!amountStr) return null
    const cleaned = amountStr.replace(/[^0-9.-]/g, "")
    const parsed = parseFloat(cleaned)

    if (isNaN(parsed)) return null

    return {
      amount: Math.abs(parsed),
      type: parsed < 0 ? "OUTFLOW" : "INFLOW",
    }
  }

  function validateAndParseRows(m?: ColumnMapping, r?: string[][]): ParsedRow[] {
    const effectiveMapping = m ?? mapping
    const effectiveRows = r ?? rows

    return effectiveRows.map((row) => {
      const parsed: ParsedRow = { raw: row, errors: [] }

      // Date
      if (effectiveMapping.date !== undefined) {
        const dateStr = row[effectiveMapping.date]
        const date = parseDate(dateStr)
        if (!date) {
          parsed.errors.push("Invalid date format")
        } else if (isFuture(date)) {
          parsed.errors.push("Date cannot be in the future")
        } else {
          parsed.date = date
        }
      } else {
        parsed.errors.push("Date is required")
      }

      // Description
      if (effectiveMapping.description !== undefined) {
        const desc = row[effectiveMapping.description]?.trim()
        if (!desc) {
          parsed.errors.push("Description cannot be empty")
        } else {
          parsed.description = desc
        }
      } else {
        parsed.errors.push("Description is required")
      }

      // Amount and Type
      const amountStr = effectiveMapping.amount !== undefined ? row[effectiveMapping.amount] : ""
      const debitStr = effectiveMapping.debit !== undefined ? row[effectiveMapping.debit] : ""
      const creditStr = effectiveMapping.credit !== undefined ? row[effectiveMapping.credit] : ""

      const amountResult = parseAmount(amountStr, debitStr, creditStr)

      if (!amountResult || amountResult.amount <= 0) {
        parsed.errors.push("Invalid or missing amount")
      } else {
        parsed.amount = amountResult.amount

        // Check if there's an explicit type column
        if (effectiveMapping.type !== undefined) {
          const typeStr = row[effectiveMapping.type]?.toUpperCase()
          if (typeStr === "INFLOW" || typeStr === "CREDIT" || typeStr === "DEPOSIT") {
            parsed.type = "INFLOW"
          } else if (typeStr === "OUTFLOW" || typeStr === "DEBIT" || typeStr === "WITHDRAWAL") {
            parsed.type = "OUTFLOW"
          } else {
            // Fall back to amount-based detection
            parsed.type = amountResult.type
          }
        } else {
          parsed.type = amountResult.type
        }
      }

      // Merchant Name (optional)
      if (effectiveMapping.merchantName !== undefined) {
        const merchant = row[effectiveMapping.merchantName]?.trim()
        parsed.merchantName = merchant || undefined
      }

      return parsed
    })
  }

  function handlePreview() {
    setError("")

    if (!mapping.date) {
      setError("Please map the Date column")
      return
    }
    if (!mapping.description) {
      setError("Please map the Description column")
      return
    }
    if (!mapping.amount && (!mapping.debit || !mapping.credit)) {
      setError("Please map the Amount column or both Debit and Credit columns")
      return
    }

    const validated = validateAndParseRows()
    setParsedRows(validated)
    setStep("preview")
  }

  async function handleImport() {
    const validRows = parsedRows.filter((row) => row.errors.length === 0)

    if (validRows.length === 0) {
      setError("No valid transactions to import")
      return
    }

    setIsSubmitting(true)
    setError("")
    setSuccessMessage("")

    try {
      const transactions = validRows.map((row) => ({
        date: row.date!.toISOString(),
        description: row.description!,
        amount: row.amount!,
        type: row.type!,
        merchantName: row.merchantName || null,
      }))

      const res = await fetch("/api/finances/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          transactions,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        setError(result.error || "Failed to import transactions")
        return
      }

      setSuccessMessage(
        `Successfully imported ${result.imported || validRows.length} transaction(s)`
      )

      // Close dialog after brief delay
      setTimeout(() => {
        onOpenChange(false)
        onSuccess()
      }, 1500)
    } catch {
      setError("Failed to import transactions. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const validCount = parsedRows.filter((row) => row.errors.length === 0).length
  const errorCount = parsedRows.length - validCount
  const previewRows = parsedRows.slice(0, 10)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import Transactions from CSV</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a CSV file containing your transactions"}
            {step === "map" && "Map CSV columns to transaction fields"}
            {step === "preview" && "Columns auto-detected — review and import, or go back to adjust"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center gap-2 text-sm mb-4">
          <div
            className={`flex items-center gap-1 ${
              step === "upload" ? "font-semibold" : "text-muted-foreground"
            }`}
          >
            <Upload className="size-4" />
            <span>Upload</span>
          </div>
          <span className="text-muted-foreground">→</span>
          <div
            className={`flex items-center gap-1 ${
              step === "map" ? "font-semibold" : "text-muted-foreground"
            }`}
          >
            <FileText className="size-4" />
            <span>Map Columns</span>
          </div>
          <span className="text-muted-foreground">→</span>
          <div
            className={`flex items-center gap-1 ${
              step === "preview" ? "font-semibold" : "text-muted-foreground"
            }`}
          >
            <CheckCircle2 className="size-4" />
            <span>Preview</span>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="size-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600 flex items-center gap-2">
            <CheckCircle2 className="size-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
              <Label
                htmlFor="csv-file"
                className="cursor-pointer text-sm font-medium"
              >
                <span className="text-primary hover:underline">
                  Choose a CSV file
                </span>
                <span className="text-muted-foreground"> or drag and drop</span>
              </Label>
              <input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              {file && (
                <div className="mt-4 text-sm text-muted-foreground">
                  Selected: {file.name}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>CSV file should contain:</p>
              <ul className="list-disc list-inside ml-2">
                <li>Header row with column names</li>
                <li>Date column (MM/DD/YYYY, YYYY-MM-DD, or DD/MM/YYYY)</li>
                <li>Description column</li>
                <li>Amount column (or separate Debit/Credit columns)</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 2: Map Columns */}
        {step === "map" && (
          <div className="space-y-4 overflow-y-auto">
            <div className="text-sm text-muted-foreground">
              Map your CSV columns to transaction fields. Required fields are marked with *.
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="map-date">Date *</Label>
                <Select
                  value={mapping.date?.toString()}
                  onValueChange={(val) =>
                    setMapping({ ...mapping, date: parseInt(val) })
                  }
                >
                  <SelectTrigger id="map-date">
                    <SelectValue placeholder="Select date column" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((header, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="map-description">Description *</Label>
                <Select
                  value={mapping.description?.toString()}
                  onValueChange={(val) =>
                    setMapping({ ...mapping, description: parseInt(val) })
                  }
                >
                  <SelectTrigger id="map-description">
                    <SelectValue placeholder="Select description column" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((header, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="map-amount">Amount *</Label>
                  <Select
                    value={mapping.amount?.toString()}
                    onValueChange={(val) =>
                      setMapping({
                        ...mapping,
                        amount: val && val !== "__none__" ? parseInt(val) : undefined,
                        debit: undefined,
                        credit: undefined,
                      })
                    }
                  >
                    <SelectTrigger id="map-amount">
                      <SelectValue placeholder="Select amount column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {headers.map((header, idx) => (
                        <SelectItem key={idx} value={idx.toString()}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Or use separate columns</Label>
                  <div className="flex gap-2">
                    <Select
                      value={mapping.debit?.toString()}
                      onValueChange={(val) =>
                        setMapping({
                          ...mapping,
                          debit: val && val !== "__none__" ? parseInt(val) : undefined,
                          amount: undefined,
                        })
                      }
                      disabled={!!mapping.amount}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Debit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {headers.map((header, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={mapping.credit?.toString()}
                      onValueChange={(val) =>
                        setMapping({
                          ...mapping,
                          credit: val && val !== "__none__" ? parseInt(val) : undefined,
                          amount: undefined,
                        })
                      }
                      disabled={!!mapping.amount}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Credit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {headers.map((header, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="map-type">Transaction Type</Label>
                <Select
                  value={mapping.type?.toString()}
                  onValueChange={(val) =>
                    setMapping({
                      ...mapping,
                      type: val && val !== "__none__" ? parseInt(val) : undefined,
                    })
                  }
                >
                  <SelectTrigger id="map-type">
                    <SelectValue placeholder="Auto-detect from amount" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Auto-detect</SelectItem>
                    {headers.map((header, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="map-merchant">Merchant Name</Label>
                <Select
                  value={mapping.merchantName?.toString()}
                  onValueChange={(val) =>
                    setMapping({
                      ...mapping,
                      merchantName: val && val !== "__none__" ? parseInt(val) : undefined,
                    })
                  }
                >
                  <SelectTrigger id="map-merchant">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {headers.map((header, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (parsedRows.length > 0) {
                    setStep("preview")
                  } else {
                    setStep("upload")
                  }
                }}
              >
                {parsedRows.length > 0 ? "Back to Preview" : "Back"}
              </Button>
              <Button type="button" onClick={handlePreview}>
                {parsedRows.length > 0 ? "Update Preview" : "Preview Import"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === "preview" && (
          <div className="flex flex-col gap-4 min-h-0">
            <div className="rounded-md bg-muted px-3 py-2 text-sm shrink-0">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {validCount} valid transaction(s)
                </span>
                {errorCount > 0 && (
                  <span className="text-destructive">{errorCount} error(s)</span>
                )}
              </div>
            </div>

            <div className="border rounded-lg overflow-auto min-h-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, idx) => (
                    <TableRow
                      key={idx}
                      className={row.errors.length > 0 ? "bg-destructive/5" : ""}
                    >
                      <TableCell>
                        {row.date
                          ? row.date.toLocaleDateString()
                          : row.raw[mapping.date ?? 0]}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {row.description || row.raw[mapping.description ?? 0]}
                      </TableCell>
                      <TableCell>
                        {row.amount !== undefined
                          ? `$${row.amount.toFixed(2)}`
                          : row.raw[mapping.amount ?? 0]}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            row.type === "INFLOW"
                              ? "bg-green-100 text-green-700"
                              : row.type === "OUTFLOW"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {row.type || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {row.merchantName || "—"}
                      </TableCell>
                      <TableCell>
                        {row.errors.length === 0 ? (
                          <CheckCircle2 className="size-4 text-green-600" />
                        ) : (
                          <div className="flex items-center gap-1 text-destructive">
                            <AlertCircle className="size-4 flex-shrink-0" />
                            <span className="text-xs">
                              {row.errors.join(", ")}
                            </span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {parsedRows.length > 10 && (
              <div className="text-xs text-muted-foreground text-center">
                Showing first 10 of {parsedRows.length} rows
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("map")}
              >
                Adjust Mapping
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={isSubmitting || validCount === 0}
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Import {validCount} Transaction(s)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
