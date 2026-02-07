import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Mail, MapPin, Phone, Clock, Crown } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CustomerEditButton } from "@/components/customers/customer-edit-button"

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const { id } = await params
  const customerId = parseInt(id, 10)

  if (isNaN(customerId)) {
    notFound()
  }

  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      userId: session.user.id,
    },
    include: {
      serviceLogs: {
        include: { serviceType: true },
        orderBy: { serviceDate: "desc" },
      },
      invoices: {
        orderBy: { issueDate: "desc" },
      },
    },
  })

  if (!customer) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/customers">
            <ArrowLeft className="size-4" />
            <span className="sr-only">Back to Customers</span>
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{customer.name}</h1>
            {customer.isVip && (
              <Badge variant="secondary" className="gap-1">
                <Crown className="size-3" />
                VIP
              </Badge>
            )}
          </div>
        </div>
        <CustomerEditButton
          customer={{
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            serviceInterval: customer.serviceInterval,
            isVip: customer.isVip,
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer Details</CardTitle>
          <CardDescription>Contact and service information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <Phone className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">Phone</p>
                <p className="text-muted-foreground text-sm">{customer.phone}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Mail className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-muted-foreground text-sm">
                  {customer.email || "Not provided"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">Address</p>
                <p className="text-muted-foreground text-sm">{customer.address}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">Service Interval</p>
                <p className="text-muted-foreground text-sm">
                  {customer.serviceInterval
                    ? `Every ${customer.serviceInterval} days`
                    : "Not set"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service History</CardTitle>
          <CardDescription>
            {customer.serviceLogs.length} service record(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customer.serviceLogs.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No service logs yet. Go to Services to log work for this customer.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.serviceLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {new Date(log.serviceDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.serviceName}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.status === "COMPLETE" ? "default" : "secondary"
                          }
                        >
                          {log.status === "COMPLETE" ? "Complete" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.paymentStatus === "PAID"
                              ? "default"
                              : "outline"
                          }
                        >
                          {log.paymentStatus === "PAID" ? "Paid" : "Unpaid"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        ${Number(log.priceCharged).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ${Number(log.amountPaid).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
          <CardDescription>
            {customer.invoices.length} invoice(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customer.invoices.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No invoices yet. Go to Invoices to create one for this customer.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {invoice.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        {new Date(invoice.issueDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            invoice.status === "PAID"
                              ? "default"
                              : invoice.status === "CANCELLED"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {invoice.status.charAt(0) +
                            invoice.status.slice(1).toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        ${Number(invoice.total).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
