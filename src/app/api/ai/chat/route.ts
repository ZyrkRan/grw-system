import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { serverGenerateStream, checkServerOllamaHealth } from "@/lib/ai/ollama-server"

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
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)

    const [categorySpending, accountBalances, pendingInvoices, recentTransactions] = await Promise.all([
      // Category spending last 3 months
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
        LIMIT 15
      `,

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

      // Recent notable transactions
      prisma.bankTransaction.findMany({
        where: { userId, date: { gte: threeMonthsAgo } },
        select: { description: true, amount: true, type: true, date: true, merchantName: true },
        orderBy: { amount: "desc" },
        take: 20,
      }),
    ])

    const contextSummary = `
FINANCIAL CONTEXT (last 3 months):

Account Balances:
${accountBalances.map((a) => `- ${a.name} (${a.type}): $${Number(a.currentBalance || 0).toFixed(2)}`).join("\n")}

Spending by Category:
${categorySpending.map((c) => `- ${c.name}${c.group_name ? ` (${c.group_name})` : ""}: $${c.total.toFixed(2)}`).join("\n")}

Pending Invoices: ${pendingInvoices.length}
${pendingInvoices.map((i) => `- #${i.invoiceNumber}: $${Number(i.total).toFixed(2)} (${i.status})`).join("\n")}

Recent Large Transactions:
${recentTransactions.slice(0, 10).map((t) => `- ${t.merchantName || t.description}: $${Number(t.amount).toFixed(2)} (${t.type}, ${t.date.toLocaleDateString()})`).join("\n")}
`.trim()

    // Build conversation history
    const conversationHistory = (history || [])
      .slice(-6) // Keep last 6 messages for context
      .map((msg: { role: string; content: string }) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n")

    const system = `You are a helpful financial advisor for a small service business owner. They run personal and business expenses through the same bank account and want to reduce debt. You have access to their real financial data shown below. Be concise, practical, and specific. Reference actual numbers from their data. When they ask about spending, categories, or trends, use the data provided.

Format your responses using markdown for readability:
- Use **bold** for key numbers and important terms
- Use bullet points for lists
- Use ### headings to organize sections when the answer covers multiple topics
- Keep sections short and scannable
- Use tables when comparing numbers side by side

${contextSummary}`

    const prompt = conversationHistory
      ? `Previous conversation:\n${conversationHistory}\n\nUser: ${message}`
      : message

    const stream = await serverGenerateStream({ prompt, system, temperature: 0.4 })

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
