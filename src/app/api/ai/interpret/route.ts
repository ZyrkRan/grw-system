import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serverGenerate, checkServerOllamaHealth } from "@/lib/ai/ollama-server"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const isHealthy = await checkServerOllamaHealth()
    if (!isHealthy) {
      return NextResponse.json({
        success: false,
        error: "Ollama is not connected. Configure it in Settings.",
      }, { status: 503 })
    }

    const body = await request.json()
    const { data, section } = body

    if (!data || !section) {
      return NextResponse.json(
        { success: false, error: "Missing data or section" },
        { status: 400 }
      )
    }

    const system = `You are a concise financial advisor analyzing a small business owner's spending data. They run personal and business expenses through the same bank account and want to reduce debt. Give practical, actionable insights in 2-3 sentences. Be direct and specific about numbers. Do not use markdown formatting.`

    let prompt = ""

    switch (section) {
      case "spending-trend":
        prompt = `Analyze this monthly spending trend and identify patterns:\n${JSON.stringify(data)}\nWhat's the overall trend and what should the user watch out for?`
        break
      case "personal-business":
        prompt = `Analyze this personal vs business spending split:\n${JSON.stringify(data)}\nIs the split healthy? What adjustments would help?`
        break
      case "top-categories":
        prompt = `These are the user's top expense categories over the last 3 months:\n${JSON.stringify(data)}\nWhich categories have the most room for reduction?`
        break
      case "recurring-charges":
        prompt = `These are detected recurring charges:\n${JSON.stringify(data)}\nWhich ones might be unnecessary or could be reduced? What's the total monthly recurring cost?`
        break
      case "debt-payoff":
        prompt = `Analyze these credit account balances and payment projections:\n${JSON.stringify(data)}\nWhat strategy would pay off debt fastest? Be specific about amounts.`
        break
      default:
        return NextResponse.json(
          { success: false, error: "Unknown section" },
          { status: 400 }
        )
    }

    const response = await serverGenerate({ prompt, system, temperature: 0.3 })

    return NextResponse.json({ success: true, data: { interpretation: response } })
  } catch (error) {
    console.error("Failed to interpret:", error)
    return NextResponse.json(
      { success: false, error: "Failed to generate interpretation" },
      { status: 500 }
    )
  }
}
