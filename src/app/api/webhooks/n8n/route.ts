import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  // Validate webhook secret
  const webhookSecret = request.headers.get("x-webhook-secret")
  const expectedSecret = process.env.N8N_WEBHOOK_SECRET

  if (!expectedSecret || webhookSecret !== expectedSecret) {
    return NextResponse.json(
      { success: false, error: "Invalid webhook secret" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { action } = body

    console.log("Incoming n8n webhook:", {
      action,
      timestamp: new Date().toISOString(),
      body,
    })

    if (!action) {
      return NextResponse.json(
        { success: false, error: "Missing action field" },
        { status: 400 }
      )
    }

    switch (action) {
      case "ping": {
        return NextResponse.json({ success: true, status: "ok" })
      }

      case "create_customer": {
        const { userId, name, phone, email, address, serviceInterval } = body

        if (!userId || !name || !phone || !address) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Missing required fields: userId, name, phone, and address are required",
            },
            { status: 400 }
          )
        }

        const customer = await prisma.customer.create({
          data: {
            name: name.trim(),
            phone: phone.trim(),
            email: email?.trim() || null,
            address: address.trim(),
            serviceInterval: serviceInterval
              ? parseInt(serviceInterval, 10)
              : null,
            userId,
          },
        })

        return NextResponse.json({ success: true, data: customer })
      }

      case "update_service_status": {
        const { serviceLogId, status } = body

        if (!serviceLogId || !status) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Missing required fields: serviceLogId and status are required",
            },
            { status: 400 }
          )
        }

        if (!["PENDING", "COMPLETE"].includes(status)) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid status. Must be PENDING or COMPLETE",
            },
            { status: 400 }
          )
        }

        const serviceLog = await prisma.serviceLog.update({
          where: { id: parseInt(serviceLogId, 10) },
          data: { status },
        })

        return NextResponse.json({ success: true, data: serviceLog })
      }

      default: {
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        )
      }
    }
  } catch (error) {
    console.error("n8n webhook processing failed:", error)
    return NextResponse.json(
      { success: false, error: "Webhook processing failed" },
      { status: 500 }
    )
  }
}
