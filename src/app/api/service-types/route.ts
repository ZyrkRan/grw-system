import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const serviceTypes = await prisma.serviceType.findMany({
      where: { userId: session.user.id },
      orderBy: { position: "asc" },
      include: {
        _count: {
          select: { serviceLogs: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: serviceTypes })
  } catch (error) {
    console.error("Failed to fetch service types:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch service types" },
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
    const { name, description, icon, position } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 }
      )
    }

    const slug = generateSlug(name)

    let finalPosition = position
    if (finalPosition === undefined || finalPosition === null) {
      const maxPositionResult = await prisma.serviceType.findFirst({
        where: { userId: session.user.id },
        orderBy: { position: "desc" },
        select: { position: true },
      })
      finalPosition = (maxPositionResult?.position ?? 0) + 1
    }

    const serviceType = await prisma.serviceType.create({
      data: {
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        icon: icon || null,
        position: finalPosition,
        userId: session.user.id,
      },
    })

    return NextResponse.json({ success: true, data: serviceType }, { status: 201 })
  } catch (error) {
    console.error("Failed to create service type:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create service type" },
      { status: 500 }
    )
  }
}
