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
  const serviceInterval = searchParams.get("serviceInterval")

  const where = {
    userId: session.user.id,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { phone: { contains: search, mode: "insensitive" as const } },
        { address: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(serviceInterval && {
      serviceInterval: parseInt(serviceInterval, 10),
    }),
  }

  try {
    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { serviceLogs: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: customers })
  } catch (error) {
    console.error("Failed to fetch customers:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch customers" },
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
    const { name, phone, email, address, serviceInterval } = body

    if (!name || !phone || !address) {
      return NextResponse.json(
        { success: false, error: "Name, phone, and address are required" },
        { status: 400 }
      )
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        address: address.trim(),
        serviceInterval: serviceInterval ? parseInt(serviceInterval, 10) : null,
        userId: session.user.id,
      },
    })

    return NextResponse.json({ success: true, data: customer }, { status: 201 })
  } catch (error) {
    console.error("Failed to create customer:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create customer" },
      { status: 500 }
    )
  }
}
