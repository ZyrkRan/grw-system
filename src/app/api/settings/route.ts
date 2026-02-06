import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    let settings = await prisma.settings.findFirst()

    if (!settings) {
      // Return default empty settings without creating a record
      return NextResponse.json({
        success: true,
        data: {
          id: null,
          companyName: null,
          companyAddress: null,
          companyCity: null,
          companyState: null,
          companyZip: null,
          companyPhone: null,
          companyEmail: null,
          companyWebsite: null,
          createdAt: null,
          updatedAt: null,
        },
      })
    }

    return NextResponse.json({ success: true, data: settings })
  } catch (error) {
    console.error("Failed to fetch settings:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch settings" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()

    const allowedFields = [
      "companyName",
      "companyAddress",
      "companyCity",
      "companyState",
      "companyZip",
      "companyPhone",
      "companyEmail",
      "companyWebsite",
    ]

    // Filter to only allowed fields
    const updateData: Record<string, string | null> = {}
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field] ?? null
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid fields provided" },
        { status: 400 }
      )
    }

    // Upsert: find the first record and update, or create if none exists
    const existing = await prisma.settings.findFirst()

    let settings
    if (existing) {
      settings = await prisma.settings.update({
        where: { id: existing.id },
        data: updateData,
      })
    } else {
      settings = await prisma.settings.create({
        data: updateData,
      })
    }

    return NextResponse.json({ success: true, data: settings })
  } catch (error) {
    console.error("Failed to update settings:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update settings" },
      { status: 500 }
    )
  }
}
