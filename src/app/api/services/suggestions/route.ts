import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const amount = searchParams.get("amount")
  const date = searchParams.get("date")
  const merchantName = searchParams.get("merchantName")
  const search = searchParams.get("search")

  try {
    const where: Record<string, unknown> = {
      OR: [
        { userId: session.user.id },
        { customer: { userId: session.user.id } },
      ],
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { serviceName: { contains: search, mode: "insensitive" as const } },
            { customer: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        },
      ]
    }

    const serviceLogs = await prisma.serviceLog.findMany({
      where,
      orderBy: { serviceDate: "desc" },
      take: 50,
      include: {
        customer: { select: { id: true, name: true } },
        serviceType: { select: { id: true, name: true, icon: true } },
      },
    })

    // Score and sort by match relevance
    const parsedAmount = amount ? parseFloat(amount) : null
    const parsedDate = date ? new Date(date) : null

    const scored = serviceLogs.map((log) => {
      let score = 0

      // Amount match (0-40 points)
      if (parsedAmount && Number(log.priceCharged) > 0) {
        const diff = Math.abs(parsedAmount - Number(log.priceCharged))
        const pct = diff / Math.max(parsedAmount, Number(log.priceCharged))
        if (pct === 0) score += 40
        else if (pct <= 0.05) score += 30
        else if (pct <= 0.1) score += 20
        else if (pct <= 0.25) score += 10
      }

      // Date proximity (0-30 points)
      if (parsedDate) {
        const daysDiff = Math.abs(
          (parsedDate.getTime() - new Date(log.serviceDate).getTime()) / (1000 * 60 * 60 * 24)
        )
        if (daysDiff <= 1) score += 30
        else if (daysDiff <= 7) score += 25
        else if (daysDiff <= 14) score += 15
        else if (daysDiff <= 30) score += 5
      }

      // Name match (0-30 points)
      if (merchantName) {
        const merchant = merchantName.toLowerCase()
        const customerName = log.customer.name.toLowerCase()
        const serviceName = log.serviceName.toLowerCase()
        if (customerName.includes(merchant) || merchant.includes(customerName)) score += 30
        else if (serviceName.includes(merchant) || merchant.includes(serviceName)) score += 20
      }

      return {
        id: log.id,
        serviceName: log.serviceName,
        serviceDate: log.serviceDate,
        priceCharged: log.priceCharged,
        status: log.status,
        paymentStatus: log.paymentStatus,
        customer: log.customer,
        serviceType: log.serviceType,
        score,
        suggested: score >= 40,
      }
    })

    // Sort by score descending, then by date descending
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime()
    })

    return NextResponse.json({ success: true, data: scored.slice(0, 30) })
  } catch (error) {
    console.error("Failed to fetch service suggestions:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch service suggestions" },
      { status: 500 }
    )
  }
}
