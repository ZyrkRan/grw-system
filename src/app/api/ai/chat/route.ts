import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { serverGenerateStream, checkServerOllamaHealth, getAssistantInstructions } from "@/lib/ai/ollama-server"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const isHealthy = await checkServerOllamaHealth()
    if (!isHealthy) {
      return new Response(
        JSON.stringify({ error: "Ollama is not connected. Configure it in Settings." }),
        { status: 503 }
      )
    }

    const body = await request.json()
    const { message, history } = body

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), { status: 400 })
    }

    // Build financial context from the user's data
    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)

    const [
      categorySpending,
      currentMonthCategorySpending,
      monthlySpending,
      currentMonthTransactions,
      accountBalances,
      pendingInvoices,
      recentServices,
      serviceTypeRevenue,
      unpaidServices,
      topCustomers,
      monthlyIncome,
      bills,
    ] = await Promise.all([
      // Category spending last 3 months (OUTFLOWS = the user's expenses)
      prisma.$queryRaw<{ name: string; group_name: string | null; total: number }[]>`
        SELECT
          tc.name,
          parent.name as group_name,
          COALESCE(SUM(bt.amount), 0)::float as total
        FROM "BankTransaction" bt
        JOIN "TransactionCategory" tc ON bt."categoryId" = tc.id
        LEFT JOIN "TransactionCategory" parent ON tc."parentId" = parent.id
        WHERE bt."userId" = ${userId}
          AND bt.type = 'OUTFLOW'
          AND bt.date >= ${threeMonthsAgo}
        GROUP BY tc.name, parent.name
        ORDER BY total DESC
      `,

      // Current month category spending (OUTFLOWS only — what the user spent this month by category)
      prisma.$queryRaw<{ name: string; group_name: string | null; total: number; tx_count: number }[]>`
        SELECT
          tc.name,
          parent.name as group_name,
          COALESCE(SUM(bt.amount), 0)::float as total,
          COUNT(*)::int as tx_count
        FROM "BankTransaction" bt
        JOIN "TransactionCategory" tc ON bt."categoryId" = tc.id
        LEFT JOIN "TransactionCategory" parent ON tc."parentId" = parent.id
        WHERE bt."userId" = ${userId}
          AND bt.type = 'OUTFLOW'
          AND bt.date >= ${currentMonthStart}
        GROUP BY tc.name, parent.name
        ORDER BY total DESC
      `,

      // Monthly spending breakdown (so model can answer "this month" questions)
      prisma.$queryRaw<{ month: string; total_outflow: number; total_inflow: number; transaction_count: number }[]>`
        SELECT
          TO_CHAR(date, 'YYYY-MM') as month,
          COALESCE(SUM(CASE WHEN type = 'OUTFLOW' THEN amount ELSE 0 END), 0)::float as total_outflow,
          COALESCE(SUM(CASE WHEN type = 'INFLOW' THEN amount ELSE 0 END), 0)::float as total_inflow,
          COUNT(*)::int as transaction_count
        FROM "BankTransaction"
        WHERE "userId" = ${userId}
          AND date >= ${threeMonthsAgo}
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        ORDER BY month DESC
      `,

      // Current month transactions (for "this month" detail questions)
      prisma.bankTransaction.findMany({
        where: { userId, date: { gte: currentMonthStart } },
        select: {
          description: true,
          amount: true,
          type: true,
          date: true,
          merchantName: true,
          category: { select: { name: true } },
        },
        orderBy: { amount: "desc" },
        take: 40,
      }),

      // Account balances
      prisma.bankAccount.findMany({
        where: { userId, isActive: true },
        select: { name: true, type: true, currentBalance: true },
      }),

      // Pending invoices
      prisma.invoice.findMany({
        where: { userId, status: { in: ["DRAFT", "SENT"] } },
        select: { invoiceNumber: true, total: true, status: true, dueDate: true },
        take: 10,
      }),

      // Recent service logs (last 3 months) — this is INCOME the user earned
      prisma.serviceLog.findMany({
        where: { userId, serviceDate: { gte: threeMonthsAgo } },
        select: {
          serviceName: true,
          serviceDate: true,
          priceCharged: true,
          amountPaid: true,
          status: true,
          paymentStatus: true,
          totalDurationMinutes: true,
          customer: { select: { name: true } },
          serviceType: { select: { name: true } },
        },
        orderBy: { serviceDate: "desc" },
        take: 50,
      }),

      // Revenue by service type (last 3 months)
      prisma.$queryRaw<{ service_type: string; count: number; total_charged: number; total_paid: number; avg_duration: number | null }[]>`
        SELECT
          COALESCE(st.name, sl."serviceName") as service_type,
          COUNT(*)::int as count,
          COALESCE(SUM(sl."priceCharged"), 0)::float as total_charged,
          COALESCE(SUM(sl."amountPaid"), 0)::float as total_paid,
          AVG(sl."totalDurationMinutes")::float as avg_duration
        FROM "ServiceLog" sl
        LEFT JOIN "ServiceType" st ON sl."serviceTypeId" = st.id
        WHERE sl."userId" = ${userId}
          AND sl."serviceDate" >= ${threeMonthsAgo}
        GROUP BY COALESCE(st.name, sl."serviceName")
        ORDER BY total_charged DESC
      `,

      // Unpaid services
      prisma.serviceLog.findMany({
        where: { userId, paymentStatus: "UNPAID", status: "COMPLETE" },
        select: {
          serviceName: true,
          serviceDate: true,
          priceCharged: true,
          amountPaid: true,
          customer: { select: { name: true } },
        },
        orderBy: { serviceDate: "asc" },
        take: 20,
      }),

      // Top customers by revenue (last 3 months)
      prisma.$queryRaw<{ customer_name: string; service_count: number; total_charged: number; total_paid: number }[]>`
        SELECT
          c.name as customer_name,
          COUNT(*)::int as service_count,
          COALESCE(SUM(sl."priceCharged"), 0)::float as total_charged,
          COALESCE(SUM(sl."amountPaid"), 0)::float as total_paid
        FROM "ServiceLog" sl
        JOIN "Customer" c ON sl."customerId" = c.id
        WHERE sl."userId" = ${userId}
          AND sl."serviceDate" >= ${threeMonthsAgo}
        GROUP BY c.name
        ORDER BY total_charged DESC
        LIMIT 15
      `,

      // Monthly service income breakdown
      prisma.$queryRaw<{ month: string; jobs: number; total_charged: number; total_paid: number }[]>`
        SELECT
          TO_CHAR("serviceDate", 'YYYY-MM') as month,
          COUNT(*)::int as jobs,
          COALESCE(SUM("priceCharged"), 0)::float as total_charged,
          COALESCE(SUM("amountPaid"), 0)::float as total_paid
        FROM "ServiceLog"
        WHERE "userId" = ${userId}
          AND "serviceDate" >= ${threeMonthsAgo}
        GROUP BY TO_CHAR("serviceDate", 'YYYY-MM')
        ORDER BY month DESC
      `,

      // Bills with current period payment status
      prisma.bill.findMany({
        where: { userId, isActive: true },
        select: {
          name: true,
          expectedAmount: true,
          frequency: true,
          dueDay: true,
          isAutoPay: true,
          category: { select: { name: true } },
          payments: {
            orderBy: { periodStart: "desc" },
            take: 2,
            select: { periodStart: true, status: true, actualAmount: true, paidAt: true },
          },
        },
        orderBy: { expectedAmount: "desc" },
      }),
    ])

    const unpaidTotal = unpaidServices.reduce((sum, s) => sum + (Number(s.priceCharged) - Number(s.amountPaid)), 0)
    const currentMonth = now.toLocaleDateString("en-US", { month: "long", year: "numeric" })

    const contextSummary = `
=== YOUR DATA — Today: ${now.toLocaleDateString()} | "This month" = ${currentMonth} | Data range: ${threeMonthsAgo.toLocaleDateString()} to today ===
ONLY reference numbers listed below. Do not invent, estimate, or use data from the wrong section.

KEY RULE: "Lawn Care", "landscaping", and any other service names in SECTION 2 are jobs the user PERFORMED FOR CUSTOMERS (income).
They are NOT the user's expenses. For spending questions, ONLY use SECTION 1.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — WHAT THE USER SPENT (bank outflows / expenses)
These are payments the user made from their bank account.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THIS MONTH SPENDING BY CATEGORY (${currentMonth}, outflows only — use this for "what did I spend most on this month"):
${currentMonthCategorySpending.length > 0
  ? currentMonthCategorySpending.map((c) => `- ${c.name}${c.group_name ? ` [${c.group_name}]` : ""}: $${c.total.toFixed(2)} (${c.tx_count} transactions)`).join("\n")
  : "No categorized outflow transactions this month."}

MONTHLY SPENDING TOTALS (bank outflows per month):
${monthlySpending.map((m) => `- ${m.month}: $${m.total_outflow.toFixed(2)} spent out, $${m.total_inflow.toFixed(2)} received in, ${m.transaction_count} total transactions`).join("\n") || "No data."}

3-MONTH CATEGORY SPENDING TOTALS (outflows, sorted highest first):
${categorySpending.map((c) => `- ${c.name}${c.group_name ? ` [${c.group_name}]` : ""}: $${c.total.toFixed(2)}`).join("\n") || "No categorized spending."}

THIS MONTH'S INDIVIDUAL TRANSACTIONS (${currentMonth}, outflows largest first):
${currentMonthTransactions.filter(t => t.type === "OUTFLOW").map((t) => `- ${t.merchantName || t.description}: $${Number(t.amount).toFixed(2)}${t.category ? ` [${t.category.name}]` : ""} on ${t.date.toLocaleDateString()}`).join("\n") || "No outflow transactions this month."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — WHAT THE USER EARNED (service income from jobs performed for customers)
NOTE: "Lawn Care" and other service names here are jobs the user did FOR customers. This is INCOME, not spending.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MONTHLY SERVICE INCOME:
${monthlyIncome.map((m) => `- ${m.month}: ${m.jobs} jobs completed, $${m.total_charged.toFixed(2)} charged, $${m.total_paid.toFixed(2)} collected`).join("\n") || "No service income data."}

INCOME BY SERVICE TYPE (3-month totals):
${serviceTypeRevenue.map((s) => `- ${s.service_type}: ${s.count} jobs, $${s.total_charged.toFixed(2)} charged, $${s.total_paid.toFixed(2)} collected${s.avg_duration ? `, avg ${Math.round(s.avg_duration)} min/job` : ""}`).join("\n") || "No services."}

TOP CUSTOMERS BY REVENUE (customers who paid the user for services):
${topCustomers.map((c) => `- ${c.customer_name}: ${c.service_count} jobs, $${c.total_charged.toFixed(2)} charged, $${c.total_paid.toFixed(2)} collected`).join("\n") || "No customer data."}

UNPAID COMPLETED SERVICES (money customers still OWE the user): ${unpaidServices.length} services, $${unpaidTotal.toFixed(2)} outstanding
${unpaidServices.map((s) => `- ${s.customer.name} — ${s.serviceName} on ${s.serviceDate.toLocaleDateString()}: $${(Number(s.priceCharged) - Number(s.amountPaid)).toFixed(2)} remaining`).join("\n") || "All services paid."}

RECENT SERVICE LOG (last 50 jobs):
${recentServices.map((s) => `- ${s.serviceDate.toLocaleDateString()}: ${s.customer.name} — ${s.serviceName}${s.serviceType ? ` [${s.serviceType.name}]` : ""}, $${Number(s.priceCharged).toFixed(2)} charged (${s.paymentStatus}${s.totalDurationMinutes ? `, ${s.totalDurationMinutes} min` : ""})`).join("\n") || "No recent services."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — ACCOUNTS, INVOICES & BILLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BANK ACCOUNT BALANCES:
${accountBalances.map((a) => `- ${a.name} (${a.type}): $${Number(a.currentBalance || 0).toFixed(2)}`).join("\n") || "No accounts."}

OPEN INVOICES (sent to customers, not yet fully paid — money coming IN):
${pendingInvoices.length > 0 ? pendingInvoices.map((i) => `- Invoice #${i.invoiceNumber}: $${Number(i.total).toFixed(2)} (${i.status}${i.dueDate ? `, due ${i.dueDate.toLocaleDateString()}` : ""})`).join("\n") : "No pending invoices."}

RECURRING BILLS — money going OUT (${bills.length} active | monthly total: $${bills.filter(b => b.frequency === "MONTHLY").reduce((s, b) => s + Number(b.expectedAmount), 0).toFixed(2)}/mo):
${bills.map((b) => {
  const latest = b.payments[0]
  const status = latest ? `last payment: ${latest.status}${latest.paidAt ? ` on ${new Date(latest.paidAt).toLocaleDateString()}` : ""}${latest.actualAmount ? ` ($${Number(latest.actualAmount).toFixed(2)})` : ""}` : "no payment history"
  return `- ${b.name}: $${Number(b.expectedAmount).toFixed(2)}/${b.frequency.toLowerCase()} (due day ${b.dueDay}${b.isAutoPay ? ", autopay" : ""}${b.category ? `, ${b.category.name}` : ""}) — ${status}`
}).join("\n") || "No active bills."}

=== END OF DATA ===
`.trim()

    // Build conversation history
    const conversationHistory = (history || [])
      .slice(-6) // Keep last 6 messages for context
      .map((msg: { role: string; content: string }) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n")

    // Load user-editable instructions (from DB or default template)
    const instructions = await getAssistantInstructions()

    // System prompt: instructions only (persona, rules, behavior)
    // qwen3 follows the system field for instructions but reads data better from the prompt
    const system = `${instructions}

Today is ${now.toLocaleDateString()}. "This month" means ${currentMonth}.`

    // Prompt: data context + conversation + question
    // /no_think disables qwen3's internal reasoning chain so it answers directly from data
    const prompt = `/no_think

${contextSummary}

${conversationHistory ? `Previous conversation:\n${conversationHistory}\n\n` : ""}User: ${message}`

    const stream = await serverGenerateStream({ prompt, system, temperature: 0.15 })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    })
  } catch (error) {
    console.error("Chat error:", error)
    return new Response(
      JSON.stringify({ error: "Failed to generate response" }),
      { status: 500 }
    )
  }
}
