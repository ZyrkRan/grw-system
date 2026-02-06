"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TransactionsTable } from "@/components/finances/transactions-table"
import { AccountsList } from "@/components/finances/accounts-list"
import { CategoriesManager } from "@/components/finances/categories-manager"

type Tab = "transactions" | "accounts" | "categories"

export default function FinancesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("transactions")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Finances</h1>
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

      {activeTab === "transactions" && <TransactionsTable />}
      {activeTab === "accounts" && <AccountsList />}
      {activeTab === "categories" && <CategoriesManager />}
    </div>
  )
}
