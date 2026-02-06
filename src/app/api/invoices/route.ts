import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { InvoiceStatus, Prisma } from "@/generated/prisma"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!
  const { searchParams } = request.nextUrl
  const customerId = searchParams.get("customerId")
  const status = searchParams.get("status")
  const search = searchParams.get("search")
  const dateFrom = searchParams.get("dateFrom")
  const dateTo = searchParams.get("dateTo")

  try {
    const where: Record<string, unknown> = {
      userId,
    }

    if (customerId) {
      where.customerId = parseInt(customerId, 10)
    }

    if (status && Object.values(InvoiceStatus).includes(status as InvoiceStatus)) {
      where.status = status as InvoiceStatus
    }

    if (search) {
      where.invoiceNumber = { contains: search, mode: "insensitive" as const }
    }

    if (dateFrom || dateTo) {
      where.issueDate = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { issueDate: "desc" },
      include: {
        customer: {
          select: { id: true, name: true },
        },
        items: true,
        _count: {
          select: { items: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: invoices })
  } catch (error) {
    console.error("Failed to fetch invoices:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch invoices" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const body = await request.json()
    const {
      customerId,
      issueDate,
      dueDate,
      notes,
      terms,
      serviceTypeId,
      items,
    } = body

    // Validation
    if (!customerId || !issueDate) {
      return NextResponse.json(
        { success: false, error: "customerId and issueDate are required" },
        { status: 400 }
      )
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one item is required" },
        { status: 400 }
      )
    }

    // Generate invoice number: INV-YYYY-NNNN
    const currentYear = new Date().getFullYear()
    const yearPrefix = `INV-${currentYear}-`

    const lastInvoice = await prisma.invoice.findFirst({
      where: {
        invoiceNumber: { startsWith: yearPrefix },
      },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    })

    let nextSequence = 1
    if (lastInvoice) {
      const lastSequence = parseInt(lastInvoice.invoiceNumber.split("-")[2], 10)
      nextSequence = lastSequence + 1
    }

    const invoiceNumber = `${yearPrefix}${String(nextSequence).padStart(4, "0")}`

    // Calculate item amounts and totals
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
    const total = subtotal // No tax for now

    // Create invoice and items in a transaction
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: parseInt(String(customerId), 10),
          issueDate: new Date(issueDate),
          dueDate: dueDate ? new Date(dueDate) : null,
          status: "DRAFT",
          subtotal,
          total,
          amountPaid: 0,
          notes: notes?.trim() || null,
          terms: terms?.trim() || null,
          serviceTypeId: serviceTypeId ? parseInt(String(serviceTypeId), 10) : null,
          userId,
        },
      })

      await tx.invoiceItem.createMany({
        data: calculatedItems.map((item) => ({
          invoiceId: created.id,
          description: item.description,
          serviceDate: item.serviceDate,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
          serviceLogId: item.serviceLogId,
        })),
      })

      return tx.invoice.findUnique({
        where: { id: created.id },
        include: {
          customer: { select: { id: true, name: true } },
          items: true,
        },
      })
    })

    return NextResponse.json({ success: true, data: invoice }, { status: 201 })
  } catch (error) {
    console.error("Failed to create invoice:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create invoice" },
      { status: 500 }
    )
  }
}
