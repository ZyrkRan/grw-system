import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// DELETE /api/tax/clear — wipe all tax transactions for the user (for re-upload)
export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { count } = await prisma.taxTransaction.deleteMany({
      where: { userId: session.user.id },
    })
    return NextResponse.json({ success: true, data: { deleted: count } })
  } catch (error) {
    console.error("Tax clear error:", error)
    return NextResponse.json({ success: false, error: "Failed to clear transactions" }, { status: 500 })
  }
}
