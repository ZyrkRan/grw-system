import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const search = searchParams.get("search") || ""
  const date = searchParams.get("date")

  const where = {
    userId: session.user.id,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(date && { date: new Date(date) }),
  }

  try {
    const routes = await prisma.route.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { customers: true },
        },
        customers: {
          orderBy: { position: "asc" },
          select: {
            customer: {
              select: {
                name: true,
                serviceLogs: {
                  select: { priceCharged: true },
                },
              },
            },
          },
        },
      },
    })

    const data = routes.map(({ customers, ...route }) => {
      let estimatedRevenue = 0
      for (const rc of customers) {
        const logs = rc.customer.serviceLogs
        if (logs.length > 0) {
          const avg =
            logs.reduce((sum, l) => sum + Number(l.priceCharged), 0) /
            logs.length
          estimatedRevenue += avg
        }
      }
      return {
        ...route,
        customerNames: customers.map((rc) => rc.customer.name),
        estimatedRevenue: Math.round(estimatedRevenue * 100) / 100,
      }
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Failed to fetch routes:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch routes" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, description, color, date } = body

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 }
      )
    }

    const route = await prisma.route.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || null,
        date: date ? new Date(date) : null,
        userId: session.user.id,
      },
      include: {
        _count: {
          select: { customers: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: route }, { status: 201 })
  } catch (error) {
    console.error("Failed to create route:", error)
    const message = error instanceof Error ? error.message : "Failed to create route"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
