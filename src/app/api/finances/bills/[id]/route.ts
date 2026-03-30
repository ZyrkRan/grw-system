import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateBillSchema, updateBillPaymentSchema, formatZodError } from "@/lib/validations/finances"

// PATCH /api/finances/bills/[id] — Update a bill or its current payment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const billId = parseInt(id, 10)
  if (isNaN(billId)) {
    return NextResponse.json({ success: false, error: "Invalid bill ID" }, { status: 400 })
  }

  try {
    const body = await request.json()

    // Check if this is a payment update or bill update
    if (body.paymentUpdate) {
      const parsed = updateBillPaymentSchema.safeParse(body.paymentUpdate)
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: formatZodError(parsed.error) },
          { status: 400 }
        )
      }

      // Verify bill ownership
      const bill = await prisma.bill.findFirst({
        where: { id: billId, userId: session.user.id },
      })
      if (!bill) {
        return NextResponse.json({ success: false, error: "Bill not found" }, { status: 404 })
      }

      const now = new Date()
      const periodStart = body.periodStart
        ? new Date(body.periodStart)
        : new Date(now.getFullYear(), now.getMonth(), 1)

      // Upsert the payment record
      const payment = await prisma.billPayment.upsert({
        where: {
          billId_periodStart: { billId, periodStart },
        },
        create: {
          billId,
          periodStart,
          status: parsed.data.status || "paid",
          actualAmount: parsed.data.actualAmount,
          transactionId: parsed.data.transactionId,
          paidAt: parsed.data.status === "paid" ? now : null,
        },
        update: {
          status: parsed.data.status,
          actualAmount: parsed.data.actualAmount,
          transactionId: parsed.data.transactionId,
          paidAt: parsed.data.status === "paid" ? now : (parsed.data.status === "pending" ? null : undefined),
        },
        include: {
          transaction: {
            select: { id: true, description: true, amount: true, date: true },
          },
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          ...payment,
          actualAmount: payment.actualAmount ? Number(payment.actualAmount) : null,
        },
      })
    }

    // Regular bill update
    const parsed = updateBillSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const bill = await prisma.bill.update({
      where: { id: billId, userId: session.user.id },
      data: parsed.data,
      include: {
        category: { select: { id: true, name: true, color: true } },
        account: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      success: true,
      data: { ...bill, expectedAmount: Number(bill.expectedAmount) },
    })
  } catch (error) {
    console.error("Failed to update bill:", error)
    return NextResponse.json({ success: false, error: "Failed to update bill" }, { status: 500 })
  }
}

// DELETE /api/finances/bills/[id] — Delete a bill and its payments
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const billId = parseInt(id, 10)
  if (isNaN(billId)) {
    return NextResponse.json({ success: false, error: "Invalid bill ID" }, { status: 400 })
  }

  try {
    await prisma.bill.delete({
      where: { id: billId, userId: session.user.id },
    })

    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error("Failed to delete bill:", error)
    return NextResponse.json({ success: false, error: "Failed to delete bill" }, { status: 500 })
  }
}
