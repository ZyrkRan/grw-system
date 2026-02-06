import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { InvoiceStatus, Prisma } from "@/generated/prisma"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!
  const { id } = await context.params

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        customer: {
          select: { id: true, name: true, phone: true, email: true, address: true },
        },
        items: {
          include: {
            serviceLog: true,
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      )
    }

    if (invoice.userId !== userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      )
    }

    return NextResponse.json({ success: true, data: invoice })
  } catch (error) {
    console.error("Failed to fetch invoice:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch invoice" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!
  const { id } = await context.params
  const invoiceId = parseInt(id, 10)

  try {
    // Verify ownership
    const existing = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, userId: true },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      )
    }

    if (existing.userId !== userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      customerId,
      issueDate,
      dueDate,
      notes,
      terms,
      serviceTypeId,
      status,
      items,
    } = body

    // Build the update data
    const updateData: Record<string, unknown> = {}

    if (customerId !== undefined) {
      updateData.customerId = parseInt(String(customerId), 10)
    }

    if (issueDate !== undefined) {
      updateData.issueDate = new Date(issueDate)
    }

    if (dueDate !== undefined) {
      updateData.dueDate = dueDate ? new Date(dueDate) : null
    }

    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null
    }

    if (terms !== undefined) {
      updateData.terms = terms?.trim() || null
    }

    if (serviceTypeId !== undefined) {
      updateData.serviceTypeId = serviceTypeId ? parseInt(String(serviceTypeId), 10) : null
    }

    if (status !== undefined) {
      if (!Object.values(InvoiceStatus).includes(status as InvoiceStatus)) {
        return NextResponse.json(
          { success: false, error: "Invalid status" },
          { status: 400 }
        )
      }
      updateData.status = status as InvoiceStatus

      // If marking as PAID, set amountPaid = total
      if (status === "PAID") {
        const current = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { total: true },
        })
        if (current) {
          updateData.amountPaid = current.total
        }
      }
    }

    // If items are provided, replace them and recalculate totals
    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json(
          { success: false, error: "At least one item is required" },
          { status: 400 }
        )
      }

      const calculatedItems = items.map(
        (item: { description: string; serviceDate: string; quantity: number; rate: number; serviceLogId?: number }) => {
          const quantity = new Prisma.Decimal(item.quantity)
          const rate = new Prisma.Decimal(item.rate)
          const amount = quantity.mul(rate)
          return {
            description: item.description.trim(),
            serviceDate: new Date(item.serviceDate),
            quantity,
            rate,
            amount,
            serviceLogId: item.serviceLogId ? parseInt(String(item.serviceLogId), 10) : null,
          }
        }
      )

      const subtotal = calculatedItems.reduce(
        (sum: Prisma.Decimal, item: { amount: Prisma.Decimal }) => sum.add(item.amount),
        new Prisma.Decimal(0)
      )
      const total = subtotal

      updateData.subtotal = subtotal
      updateData.total = total

      const invoice = await prisma.$transaction(async (tx) => {
        // Delete existing items
        await tx.invoiceItem.deleteMany({
          where: { invoiceId },
        })

        // Update invoice
        await tx.invoice.update({
          where: { id: invoiceId },
          data: updateData,
        })

        // Create new items
        await tx.invoiceItem.createMany({
          data: calculatedItems.map((item) => ({
            invoiceId,
            description: item.description,
            serviceDate: item.serviceDate,
            quantity: item.quantity,
            rate: item.rate,
            amount: item.amount,
            serviceLogId: item.serviceLogId,
          })),
        })

        return tx.invoice.findUnique({
          where: { id: invoiceId },
          include: {
            customer: { select: { id: true, name: true } },
            items: true,
          },
        })
      })

      return NextResponse.json({ success: true, data: invoice })
    }

    // No items replacement, just update fields
    const invoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: updateData,
      include: {
        customer: { select: { id: true, name: true } },
        items: true,
      },
    })

    return NextResponse.json({ success: true, data: invoice })
  } catch (error) {
    console.error("Failed to update invoice:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update invoice" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!
  const { id } = await context.params
  const invoiceId = parseInt(id, 10)

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, userId: true, status: true },
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      )
    }

    if (invoice.userId !== userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      )
    }

    if (invoice.status !== "DRAFT") {
      return NextResponse.json(
        { success: false, error: "Only DRAFT invoices can be deleted" },
        { status: 400 }
      )
    }

    await prisma.invoice.delete({
      where: { id: invoiceId },
    })

    return NextResponse.json({ success: true, message: "Invoice deleted" })
  } catch (error) {
    console.error("Failed to delete invoice:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete invoice" },
      { status: 500 }
    )
  }
}
