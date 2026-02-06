import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    )
  }

  const userId = session.user!.id!

  try {
    const body = await request.json()
    const { name, email, password } = body

    const updateData: Record<string, string> = {}

    if (name !== undefined) {
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "Name cannot be empty" },
          { status: 400 }
        )
      }
      updateData.name = name.trim()
    }

    if (email !== undefined) {
      if (!email || typeof email !== "string" || email.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "Email cannot be empty" },
          { status: 400 }
        )
      }

      // Check if email is already taken by another user
      const existingUser = await prisma.user.findUnique({
        where: { email: email.trim() },
      })

      if (existingUser && existingUser.id !== userId) {
        return NextResponse.json(
          { success: false, error: "Email is already in use" },
          { status: 409 }
        )
      }

      updateData.email = email.trim()
    }

    if (password !== undefined) {
      if (
        !password ||
        typeof password !== "string" ||
        password.length < 6
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Password must be at least 6 characters",
          },
          { status: 400 }
        )
      }
      updateData.password = await bcrypt.hash(password, 12)
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid fields provided" },
        { status: 400 }
      )
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ success: true, data: updatedUser })
  } catch (error) {
    console.error("Failed to update user:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update user" },
      { status: 500 }
    )
  }
}
