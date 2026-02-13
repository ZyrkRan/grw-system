"use client"

import { useState, useEffect, useCallback } from "react"
import {
  DollarSign,
  Users,
  Wrench,
  Clock,
  FileText,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

interface DashboardData {
  revenueThisMonth: number
  revenueLastMonth: number
  totalCustomers: number
  newCustomersThisMonth: number
  servicesThisMonth: number
  completedServicesThisMonth: number
  pendingPayments: number
  pendingPaymentAmount: number
  invoicesByStatus: {
    DRAFT: number
    SENT: number
    PAID: number
    CANCELLED: number
  }
  recentActivity: Array<{
    id: number
    serviceName: string
    serviceDate: string
    status: string
    paymentStatus: string
    priceCharged: number
    customer: { name: string }
  }>
  monthlyRevenue: Array<{ month: string; revenue: number }>
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString()
}

function getMonthLabel(monthStr: string) {
  const [year, month] = monthStr.split("-")
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString("en-US", { month: "short" })
}

function getPercentageChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "+100%" : "0%"
  const change = ((current - previous) / previous) * 100
  const sign = change >= 0 ? "+" : ""
  return `${sign}${change.toFixed(1)}%`
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true)
    setError("")
    try {
      const res = await fetch("/api/dashboard")
      const result = await res.json()
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.error || "Failed to load dashboard data.")
      }
    } catch {
      setError("Failed to load dashboard data. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  if (error && !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="size-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-28 mb-1" />
                <Skeleton className="h-3 w-36" />
              </CardContent>
            </Card>
          ))
        ) : data ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Revenue This Month
                </CardTitle>
                <DollarSign className="text-muted-foreground size-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(data.revenueThisMonth)}
                </div>
                <p className="text-muted-foreground text-xs">
                  {getPercentageChange(
                    data.revenueThisMonth,
                    data.revenueLastMonth
                  )}{" "}
                  from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Customers
                </CardTitle>
                <Users className="text-muted-foreground size-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalCustomers}</div>
                <p className="text-muted-foreground text-xs">
                  {data.newCustomersThisMonth} new this month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Services This Month
                </CardTitle>
                <Wrench className="text-muted-foreground size-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.servicesThisMonth}
                </div>
                <p className="text-muted-foreground text-xs">
                  {data.completedServicesThisMonth} completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Pending Payments
                </CardTitle>
                <Clock className="text-muted-foreground size-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.pendingPayments}
                </div>
                <p className="text-muted-foreground text-xs">
                  {formatCurrency(data.pendingPaymentAmount)} total pending
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Two-column layout: Recent Activity + Revenue Chart */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : data && data.recentActivity.length > 0 ? (
              <div className="space-y-4">
                {data.recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-none">
                        {activity.customer?.name ?? "Unknown"}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {activity.serviceName} &middot;{" "}
                        {formatDate(activity.serviceDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          activity.status === "COMPLETE"
                            ? "bg-green-600 text-white"
                            : "border-amber-500 text-amber-600"
                        }
                      >
                        {activity.status}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          activity.paymentStatus === "PAID"
                            ? "bg-green-600 text-white"
                            : "border-amber-500 text-amber-600"
                        }
                      >
                        {activity.paymentStatus}
                      </Badge>
                      <span className="text-sm font-medium whitespace-nowrap">
                        {formatCurrency(Number(activity.priceCharged))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No recent activity
              </p>
            )}
          </CardContent>
        </Card>

        {/* Revenue Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-end gap-3 h-48">
                {[65, 45, 80, 55, 90, 70].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <Skeleton
                      className="w-full"
                      style={{ height: `${h}%` }}
                    />
                    <Skeleton className="h-3 w-8" />
                  </div>
                ))}
              </div>
            ) : data && data.monthlyRevenue.length > 0 ? (
              <RevenueChart monthlyRevenue={data.monthlyRevenue} />
            ) : (
              <p className="text-muted-foreground text-sm">No revenue data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoice Summary */}
      {isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-4">
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-8 w-12" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : data ? (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <FileText className="text-muted-foreground size-5" />
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-muted-foreground text-sm">Draft</p>
                <p className="text-2xl font-bold">
                  {data.invoicesByStatus.DRAFT}
                </p>
              </div>
              <div className="rounded-lg border p-4 bg-blue-50 dark:bg-blue-950/30">
                <p className="text-muted-foreground text-sm">Sent</p>
                <p className="text-2xl font-bold">
                  {data.invoicesByStatus.SENT}
                </p>
              </div>
              <div className="rounded-lg border p-4 bg-green-50 dark:bg-green-950/30">
                <p className="text-muted-foreground text-sm">
                  Paid
                </p>
                <p className="text-2xl font-bold">
                  {data.invoicesByStatus.PAID}
                </p>
              </div>
              <div className="rounded-lg border p-4 bg-red-50 dark:bg-red-950/30">
                <p className="text-muted-foreground text-sm">
                  Cancelled
                </p>
                <p className="text-2xl font-bold">
                  {data.invoicesByStatus.CANCELLED}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function RevenueChart({
  monthlyRevenue,
}: {
  monthlyRevenue: Array<{ month: string; revenue: number }>
}) {
  const maxRevenue = Math.max(...monthlyRevenue.map((m) => m.revenue), 1)

  return (
    <div className="flex items-end gap-3 h-52">
      {monthlyRevenue.map((item) => {
        const heightPercent = (item.revenue / maxRevenue) * 100
        return (
          <div
            key={item.month}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {formatCurrency(item.revenue)}
            </span>
            <div
              className="w-full rounded-t-sm bg-primary transition-all duration-300"
              style={{
                height: `${Math.max(heightPercent, 2)}%`,
                minHeight: "4px",
              }}
            />
            <span className="text-xs text-muted-foreground font-medium">
              {getMonthLabel(item.month)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
