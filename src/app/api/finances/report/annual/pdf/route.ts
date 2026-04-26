import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { aggregateAnnualReport } from "@/lib/finances-report-aggregator"
import { renderToBuffer } from "@react-pdf/renderer"
import { AnnualReportPdf } from "@/components/finances/pdf/annual-report-pdf"

export const runtime = "nodejs"

// GET /api/finances/report/annual/pdf?year=YYYY[&accountId=N]
//
// Renders the annual report as a PDF. Defaults to current year when no
// year is specified.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id
  const sp = request.nextUrl.searchParams

  const yearParam = sp.get("year")
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()
  if (isNaN(year) || year < 1900 || year > 2200) {
    return NextResponse.json({ success: false, error: "Invalid year" }, { status: 400 })
  }

  const accountIdParam = sp.get("accountId")
  const accountId = accountIdParam ? parseInt(accountIdParam, 10) : null

  const start = new Date(year, 0, 1)
  const end = new Date(year + 1, 0, 1)

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      ...(accountId && !isNaN(accountId) ? { accountId } : {}),
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          color: true,
          parent: { select: { name: true } },
        },
      },
    },
    orderBy: { date: "asc" },
  })

  const report = aggregateAnnualReport(transactions)

  const generatedAt = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

  const pdf = await renderToBuffer(
    AnnualReportPdf({ report, year: String(year), generatedAt })
  )

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="finances-report-${year}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
