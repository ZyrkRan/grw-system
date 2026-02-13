import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { InvoiceActions } from "@/components/invoices/invoice-actions"

interface InvoiceDetailPageProps {
  params: Promise<{ id: string }>
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "$0.00"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value))
}

function formatDate(dateString: string | Date): string {
  return new Date(dateString).toLocaleDateString()
}

function getStatusBadge(status: string) {
  switch (status) {
    case "DRAFT":
      return (
        <Badge variant="outline" className="text-base px-3 py-1">
          Draft
        </Badge>
      )
    case "SENT":
      return (
        <Badge className="bg-blue-600 text-white text-base px-3 py-1">
          Sent
        </Badge>
      )
    case "PAID":
      return (
        <Badge className="bg-green-600 text-white text-base px-3 py-1">
          Paid
        </Badge>
      )
    case "CANCELLED":
      return (
        <Badge variant="destructive" className="text-base px-3 py-1">
          Cancelled
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-base px-3 py-1">
          {status}
        </Badge>
      )
  }
}

export default async function InvoiceDetailPage({
  params,
}: InvoiceDetailPageProps) {
  const session = await auth()

  // Dashboard layout ensures we're authenticated
  // If session is missing here, something is wrong - show 404 instead of redirecting
  if (!session?.user?.id) {
    notFound()
  }

  const { id } = await params
  const invoiceId = parseInt(id, 10)

  if (isNaN(invoiceId)) {
    notFound()
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      userId: session.user.id,
    },
    include: {
      customer: true,
      items: {
        orderBy: { id: "asc" },
      },
    },
  })

  if (!invoice) {
    notFound()
  }

  const balanceDue = Number(invoice.total) - Number(invoice.amountPaid)

  // Serialize for client component
  const invoiceForActions = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    status: invoice.status,
    subtotal: Number(invoice.subtotal),
    total: Number(invoice.total),
    amountPaid: Number(invoice.amountPaid),
    notes: invoice.notes,
    terms: invoice.terms,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      serviceDate: item.serviceDate.toISOString(),
      quantity: Number(item.quantity),
      rate: Number(item.rate),
      amount: Number(item.amount),
      serviceLogId: item.serviceLogId,
    })),
  }

  return (
    <div className="space-y-6">
      {/* Back link and actions */}
      <div className="flex items-center gap-4 print:hidden">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/invoices">
            <ArrowLeft className="size-4" />
            <span className="sr-only">Back to Invoices</span>
          </Link>
        </Button>
        <div className="flex-1" />
        <InvoiceActions invoice={invoiceForActions} />
      </div>

      {/* Invoice Document */}
      <div className="mx-auto max-w-3xl rounded-lg border bg-card p-4 sm:p-8 shadow-sm print:border-none print:shadow-none print:p-0 print:max-w-none">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">INVOICE</h1>
            <p className="text-lg text-muted-foreground mt-1">
              {invoice.invoiceNumber}
            </p>
          </div>
          <div className="print:hidden">
            {getStatusBadge(invoice.status)}
          </div>
        </div>

        <Separator className="my-6" />

        {/* Company and Customer Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              From
            </p>
            <p className="text-lg font-semibold">GRW Services</p>
            {/* Company details will come from Settings in a future phase */}
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Bill To
            </p>
            <p className="text-lg font-semibold">{invoice.customer.name}</p>
            {invoice.customer.address && (
              <p className="text-sm text-muted-foreground">
                {invoice.customer.address}
              </p>
            )}
            {invoice.customer.phone && (
              <p className="text-sm text-muted-foreground">
                {invoice.customer.phone}
              </p>
            )}
            {invoice.customer.email && (
              <p className="text-sm text-muted-foreground">
                {invoice.customer.email}
              </p>
            )}
          </div>
        </div>

        {/* Dates */}
        <div className="mt-6 flex gap-8">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Issue Date
            </p>
            <p className="text-sm font-medium">
              {formatDate(invoice.issueDate)}
            </p>
          </div>
          {invoice.dueDate && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Due Date
              </p>
              <p className="text-sm font-medium">
                {formatDate(invoice.dueDate)}
              </p>
            </div>
          )}
        </div>

        {/* Line Items */}
        <div className="mt-8 rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Description</TableHead>
                <TableHead>Service Date</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.description}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(item.serviceDate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(item.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatCurrency(Number(item.rate))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatCurrency(Number(item.amount))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <div className="w-72 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">
                {formatCurrency(Number(invoice.subtotal))}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {formatCurrency(Number(invoice.total))}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount Paid</span>
              <span className="tabular-nums">
                {formatCurrency(Number(invoice.amountPaid))}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Balance Due</span>
              <span className="tabular-nums">
                {formatCurrency(balanceDue)}
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mt-8">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Notes
            </p>
            <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {/* Terms */}
        {invoice.terms && (
          <div className="mt-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Terms
            </p>
            <p className="text-sm whitespace-pre-wrap">{invoice.terms}</p>
          </div>
        )}
      </div>
    </div>
  )
}
