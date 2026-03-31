"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import {
  DollarSign,
  Users,
  Wrench,
  Clock,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { CalendarEvent } from "@/components/dashboard/calendar-view"

const CalendarView = dynamic(
  () => import("@/components/dashboard/calendar-view").then((m) => m.CalendarView),
  { loading: () => <Skeleton className="h-[500px] rounded-xl" /> }
)
const AgendaPanel = dynamic(
  () => import("@/components/dashboard/agenda-panel").then((m) => m.AgendaPanel),
  { loading: () => <Skeleton className="h-[500px] rounded-xl" /> }
)

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

function getPercentageChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "+100%" : "0%"
  const change = ((current - previous) / previous) * 100
  const sign = change >= 0 ? "+" : ""
  return `${sign}${change.toFixed(1)}%`
}

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)

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

  function handleEventClick(event: CalendarEvent) {
    if (event.type === "service") {
      router.push("/services")
    } else if (event.type === "invoice") {
      router.push(`/invoices/${event.id}`)
    } else if (event.type === "customer-due") {
      router.push(`/customers/${event.customerId}`)
    }
  }

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Calendar + Agenda */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardContent className="pt-6">
            <CalendarView
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
              onEventClick={handleEventClick}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <AgendaPanel
              selectedDate={selectedDate}
              onEventClick={handleEventClick}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
