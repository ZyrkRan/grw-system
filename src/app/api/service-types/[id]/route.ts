import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = { params: Promise<{ id: string }> }

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const serviceTypeId = parseInt(id, 10)

  if (isNaN(serviceTypeId)) {
    return NextResponse.json({ success: false, error: "Invalid service type ID" }, { status: 400 })
  }

  try {
    const existing = await prisma.serviceType.findFirst({
      where: { id: serviceTypeId, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: "Service type not found" }, { status: 404 })
    }

    const body = await request.json()
    const { name, slug, description, color, icon, position } = body

    // If name changes and no slug provided, regenerate slug
    const shouldRegenerateSlug = name !== undefined && name.trim() !== existing.name && slug === undefined
    const finalSlug = shouldRegenerateSlug ? generateSlug(name) : slug

    const serviceType = await prisma.serviceType.update({
      where: { id: serviceTypeId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(finalSlug !== undefined && { slug: finalSlug }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(color !== undefined && { color: color || null }),
        ...(icon !== undefined && { icon: icon || null }),
        ...(position !== undefined && { position }),
      },
    })

    return NextResponse.json({ success: true, data: serviceType })
  } catch (error) {
    console.error("Failed to update service type:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update service type" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const serviceTypeId = parseInt(id, 10)

  if (isNaN(serviceTypeId)) {
    return NextResponse.json({ success: false, error: "Invalid service type ID" }, { status: 400 })
  }

  try {
    const existing = await prisma.serviceType.findFirst({
      where: { id: serviceTypeId, userId: session.user.id },
      include: {
        _count: { select: { serviceLogs: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: "Service type not found" }, { status: 404 })
    }

    if (existing._count.serviceLogs > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete service type with ${existing._count.serviceLogs} service log(s). Remove or reassign service logs first.`,
        },
        { status: 400 }
      )
    }

    await prisma.serviceType.delete({ where: { id: serviceTypeId } })

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error("Failed to delete service type:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete service type" },
      { status: 500 }
    )
  }
}
