// Shared aggregator for annual tax reports.
// Used by both the JSON endpoint (`/api/tax/report/annual`) and the PDF
// endpoint (`/api/tax/report/annual/pdf`) so the math has one source of truth.

export interface AggregatorTransaction {
  id: number
  date: Date
  description: string
  amount: unknown // Prisma Decimal
  type: "INFLOW" | "OUTFLOW" | string
  taxType: string | null
  category: { name: string | null } | { name: string } | null
}

export interface CategoryBreakdown {
  category: string
  total: number
}

export interface MonthBreakdown {
  month: string
  totalIncome: number
  serviceIncome: number
  personalIncome: number
  businessExpenses: number
  personalExpenses: number
  uncategorizedCount: number
  totalTransactions: number
  net: number
  businessByCategory: CategoryBreakdown[]
  personalByCategory: CategoryBreakdown[]
  businessIncomeByCategory: CategoryBreakdown[]
  personalIncomeByCategory: CategoryBreakdown[]
}

export interface FlaggedItem {
  id: number
  date: string
  description: string
  amount: number
  type: string
  reason: string
}

export interface AnnualReport {
  totals: {
    income: number
    serviceIncome: number
    personalIncome: number
    businessExpenses: number
    personalExpenses: number
    net: number
    totalTransactions: number
    uncategorizedCount: number
  }
  monthlyBreakdown: MonthBreakdown[]
  businessByCategory: CategoryBreakdown[]
  personalByCategory: CategoryBreakdown[]
  businessIncomeByCategory: CategoryBreakdown[]
  personalIncomeByCategory: CategoryBreakdown[]
  flagged: FlaggedItem[]
}

interface MonthAcc {
  month: string
  totalIncome: number
  serviceIncome: number
  personalIncome: number
  businessExpenses: number
  personalExpenses: number
  uncategorizedCount: number
  totalTransactions: number
  bizCatMap: Record<string, number>
  persCatMap: Record<string, number>
  bizIncomeCatMap: Record<string, number>
  persIncomeCatMap: Record<string, number>
}

function sortCategoryMap(map: Record<string, number>): CategoryBreakdown[] {
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .map(([category, total]) => ({ category, total }))
}

export function aggregateAnnualReport(transactions: AggregatorTransaction[]): AnnualReport {
  const monthMap = new Map<string, MonthAcc>()
  let ytdIncome = 0
  let ytdServiceIncome = 0
  let ytdPersonalIncome = 0
  let ytdBusinessExpenses = 0
  let ytdPersonalExpenses = 0
  let ytdUncategorized = 0
  const bizCatMap: Record<string, number> = {}
  const persCatMap: Record<string, number> = {}
  const bizIncomeCatMap: Record<string, number> = {}
  const persIncomeCatMap: Record<string, number> = {}
  const flagged: FlaggedItem[] = []

  for (const tx of transactions) {
    const month = tx.date.toISOString().slice(0, 7)
    const amount = Number(tx.amount)
    const isBiz = tx.taxType === "business" || tx.taxType === "service_income"

    let m = monthMap.get(month)
    if (!m) {
      m = {
        month,
        totalIncome: 0,
        serviceIncome: 0,
        personalIncome: 0,
        businessExpenses: 0,
        personalExpenses: 0,
        uncategorizedCount: 0,
        totalTransactions: 0,
        bizCatMap: {},
        persCatMap: {},
        bizIncomeCatMap: {},
        persIncomeCatMap: {},
      }
      monthMap.set(month, m)
    }
    m.totalTransactions++

    if (!tx.taxType) {
      m.uncategorizedCount++
      ytdUncategorized++
      flagged.push({
        id: tx.id,
        date: tx.date.toISOString().split("T")[0],
        description: tx.description,
        amount,
        type: tx.type,
        reason: "Uncategorized",
      })
    }

    const catName = tx.category?.name || "Uncategorized"

    if (tx.type === "INFLOW") {
      m.totalIncome += amount
      ytdIncome += amount
      if (isBiz) {
        m.serviceIncome += amount
        ytdServiceIncome += amount
        bizIncomeCatMap[catName] = (bizIncomeCatMap[catName] || 0) + amount
        m.bizIncomeCatMap[catName] = (m.bizIncomeCatMap[catName] || 0) + amount
      } else if (tx.taxType === "personal") {
        m.personalIncome += amount
        ytdPersonalIncome += amount
        persIncomeCatMap[catName] = (persIncomeCatMap[catName] || 0) + amount
        m.persIncomeCatMap[catName] = (m.persIncomeCatMap[catName] || 0) + amount
      }
    } else {
      if (tx.taxType === "business") {
        m.businessExpenses += amount
        ytdBusinessExpenses += amount
        bizCatMap[catName] = (bizCatMap[catName] || 0) + amount
        m.bizCatMap[catName] = (m.bizCatMap[catName] || 0) + amount
      } else if (tx.taxType === "personal") {
        m.personalExpenses += amount
        ytdPersonalExpenses += amount
        persCatMap[catName] = (persCatMap[catName] || 0) + amount
        m.persCatMap[catName] = (m.persCatMap[catName] || 0) + amount
      }
    }

  }

  const monthlyBreakdown: MonthBreakdown[] = Array.from(monthMap.values()).map((m) => ({
    month: m.month,
    totalIncome: m.totalIncome,
    serviceIncome: m.serviceIncome,
    personalIncome: m.personalIncome,
    businessExpenses: m.businessExpenses,
    personalExpenses: m.personalExpenses,
    uncategorizedCount: m.uncategorizedCount,
    totalTransactions: m.totalTransactions,
    net: m.serviceIncome - m.businessExpenses,
    businessByCategory: sortCategoryMap(m.bizCatMap),
    personalByCategory: sortCategoryMap(m.persCatMap),
    businessIncomeByCategory: sortCategoryMap(m.bizIncomeCatMap),
    personalIncomeByCategory: sortCategoryMap(m.persIncomeCatMap),
  }))

  return {
    totals: {
      income: ytdIncome,
      serviceIncome: ytdServiceIncome,
      personalIncome: ytdPersonalIncome,
      businessExpenses: ytdBusinessExpenses,
      personalExpenses: ytdPersonalExpenses,
      net: ytdServiceIncome - ytdBusinessExpenses,
      totalTransactions: transactions.length,
      uncategorizedCount: ytdUncategorized,
    },
    monthlyBreakdown,
    businessByCategory: sortCategoryMap(bizCatMap),
    personalByCategory: sortCategoryMap(persCatMap),
    businessIncomeByCategory: sortCategoryMap(bizIncomeCatMap),
    personalIncomeByCategory: sortCategoryMap(persIncomeCatMap),
    flagged,
  }
}
