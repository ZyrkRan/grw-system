"use client"

import { useState, useEffect } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TransactionsTable } from "@/components/finances/transactions-table"
import { AccountsList } from "@/components/finances/accounts-list"
import { CategoriesManager } from "@/components/finances/categories-manager"
import { CategoryAnalytics } from "@/components/finances/category-analytics"
import { BalanceChart } from "@/components/finances/balance-chart"

interface Account {
  id: number
  name: string
}

type Tab = "transactions" | "accounts" | "categories"
type AnalyticsTab = "categories" | "balance"

const ANALYTICS_STORAGE_KEY = "finances-analytics-open"

export default function FinancesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("transactions")
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState("all")
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("categories")
  const [analyticsOpen, setAnalyticsOpen] = useState(() => {
    if (typeof window === "undefined") return true
    const stored = localStorage.getItem(ANALYTICS_STORAGE_KEY)
    return stored === null ? true : stored === "true"
  })

  const handleAnalyticsOpenChange = (open: boolean) => {
    setAnalyticsOpen(open)
    localStorage.setItem(ANALYTICS_STORAGE_KEY, String(open))
  }

  useEffect(() => {
    fetch("/api/finances/accounts")
      .then((r) => r.json())
      .then((result) => {
        if (result.success) {
          setAccounts(result.data)
        }
      })
      .catch((err) => console.error("Failed to load accounts:", err))
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Finances</h1>
        {activeTab === "transactions" && accounts.length > 0 && (
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={String(account.id)}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex gap-1 border-b">
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
            activeTab === "accounts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("accounts")}
        >
          Accounts
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
          <Collapsible open={analyticsOpen} onOpenChange={handleAnalyticsOpenChange}>
            <div className="flex items-center justify-between mb-4">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 -ml-2 px-2">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      !analyticsOpen && "-rotate-90"
                    )}
                  />
                  <span className="text-sm font-semibold">Analytics</span>
                </Button>
              </CollapsibleTrigger>
              {analyticsOpen && (
                <div className="flex rounded-md border border-input">
                  {(["categories", "balance"] as const).map((tab, idx, arr) => (
                    <Button
                      key={tab}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 rounded-none px-3 text-xs",
                        idx === 0 && "rounded-l-md",
                        idx === arr.length - 1 && "rounded-r-md",
                        analyticsTab === tab && "bg-muted font-medium hover:bg-muted"
                      )}
                      onClick={() => setAnalyticsTab(tab)}
                    >
                      {tab === "categories" ? "Categories" : "Balance"}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <CollapsibleContent forceMount className={cn(!analyticsOpen && "hidden")}>
              {analyticsTab === "categories" && <CategoryAnalytics accountId={selectedAccountId} />}
              {analyticsTab === "balance" && <BalanceChart accountId={selectedAccountId} />}
            </CollapsibleContent>
          </Collapsible>
          <TransactionsTable accountId={selectedAccountId} />
        </>
      )}
      {activeTab === "accounts" && <AccountsList />}
      {activeTab === "categories" && <CategoriesManager />}
    </div>
  )
}
