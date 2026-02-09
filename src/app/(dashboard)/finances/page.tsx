"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TransactionsTable } from "@/components/finances/transactions-table"
import { CategoriesManager } from "@/components/finances/categories-manager"
import { CategoryAnalytics } from "@/components/finances/category-analytics"
import { BalanceChart } from "@/components/finances/balance-chart"
import { InflowOutflowChart } from "@/components/finances/inflow-outflow-chart"
import { TimeframeSelector, getTimeframeValue, type TimeframeValue } from "@/components/finances/timeframe-selector"
import { AccountSwitcher } from "@/components/finances/account-switcher"

type Tab = "transactions" | "categories"
type AnalyticsTab = "inflow-outflow" | "categories" | "balance"

const TIMEFRAME_STORAGE_KEY = "finances-timeframe"
const ACCOUNT_STORAGE_KEY = "finances-selected-account"

export default function FinancesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("transactions")
  const [selectedAccountId, setSelectedAccountId] = useState("all")
  const [timeframe, setTimeframe] = useState<TimeframeValue>(() => getTimeframeValue("month"))

  // Hydrate timeframe from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const stored = localStorage.getItem(TIMEFRAME_STORAGE_KEY)
    if (stored) {
      try {
        setTimeframe(JSON.parse(stored))
      } catch {
        // Invalid stored value, keep default
      }
    }
  }, [])

  // Hydrate selected account from localStorage after mount
  useEffect(() => {
    const stored = localStorage.getItem(ACCOUNT_STORAGE_KEY)
    if (stored) {
      setSelectedAccountId(stored)
    }
  }, [])

  const handleTimeframeChange = (newTimeframe: TimeframeValue) => {
    setTimeframe(newTimeframe)
    localStorage.setItem(TIMEFRAME_STORAGE_KEY, JSON.stringify(newTimeframe))
  }

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId)
    localStorage.setItem(ACCOUNT_STORAGE_KEY, accountId)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Finances</h1>
          {activeTab === "transactions" && (
            <AccountSwitcher
              selectedAccountId={selectedAccountId}
              onAccountChange={handleAccountChange}
            />
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        <Button
          variant="ghost"
          className={cn(
            "rounded-none border-b-2 px-4 py-2",
            activeTab === "transactions"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("transactions")}
        >
          Transactions
        </Button>
        <Button
          variant="ghost"
          className={cn(
            "rounded-none border-b-2 px-4 py-2",
            activeTab === "categories"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("categories")}
        >
          Categories
        </Button>
      </div>

      {activeTab === "transactions" && (
        <>
          <TimeframeSelector value={timeframe} onChange={handleTimeframeChange} />

          {/* Analytics Grid - All charts visible */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InflowOutflowChart accountId={selectedAccountId} timeframe={timeframe} compact />
            <CategoryAnalytics accountId={selectedAccountId} timeframe={timeframe} compact />
            <BalanceChart accountId={selectedAccountId} timeframe={timeframe} compact />
          </div>

          <TransactionsTable accountId={selectedAccountId} timeframe={timeframe} />
        </>
      )}
      {activeTab === "categories" && <CategoriesManager />}
    </div>
  )
}
