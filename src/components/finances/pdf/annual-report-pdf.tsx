import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import type { AnnualReport, MonthBreakdown } from "@/lib/finances-report-aggregator"
import { IncomeExpenseBars, CategoryPie, bucketItems, PIE_PALETTE } from "./charts"

// ── Formatting ────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtExact(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n)
}

function formatMonthLong(m: string) {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

// ── Styles ────────────────────────────────────────────────────────

const COLORS = {
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  emerald: "#059669",
  red: "#dc2626",
  orange: "#ea580c",
  blue: "#2563eb",
  purple: "#7c3aed",
  bgMuted: "#f8fafc",
  bgEmerald: "#ecfdf5",
  bgRed: "#fef2f2",
  bgAmber: "#fffbeb",
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    fontSize: 10,
    color: COLORS.text,
    fontFamily: "Helvetica",
  },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 11, color: COLORS.muted, marginBottom: 18 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    marginTop: 14,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  statCard: {
    width: "32%",
    padding: 8,
    borderRadius: 4,
    backgroundColor: COLORS.bgMuted,
  },
  statLabel: { fontSize: 8, color: COLORS.muted, marginBottom: 2 },
  statValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  table: {
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.bgMuted,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  tableTotalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: COLORS.bgMuted,
    fontFamily: "Helvetica-Bold",
  },
  thMonth: { flex: 2, fontSize: 8, color: COLORS.muted, fontFamily: "Helvetica-Bold" },
  thNum: { flex: 1, fontSize: 8, color: COLORS.muted, textAlign: "right", fontFamily: "Helvetica-Bold" },
  tdMonth: { flex: 2, fontSize: 9 },
  tdNum: { flex: 1, fontSize: 9, textAlign: "right" },
  monthHeader: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  monthSub: { fontSize: 10, color: COLORS.muted, marginBottom: 14 },
  chartRow: {
    flexDirection: "row",
    gap: 16,
    marginVertical: 10,
  },
  chartBox: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    alignItems: "center",
  },
  chartLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLORS.muted,
    marginBottom: 6,
    alignSelf: "flex-start",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 1.5,
    width: "100%",
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 1,
    marginRight: 6,
  },
  legendName: { flex: 1, fontSize: 8 },
  legendValue: { fontSize: 8, color: COLORS.muted },
  pageFooter: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    fontSize: 8,
    color: COLORS.muted,
    textAlign: "center",
  },
  flaggedRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  flaggedDate: { width: 60, fontSize: 8, color: COLORS.muted },
  flaggedDesc: { flex: 1, fontSize: 8 },
  flaggedAmount: { width: 60, fontSize: 8, textAlign: "right" },
  flaggedReason: { width: 80, fontSize: 8, textAlign: "right", color: COLORS.muted },
})

// ── Document ──────────────────────────────────────────────────────

interface Props {
  report: AnnualReport
  year: string
  generatedAt: string
}

export function AnnualReportPdf({ report, year, generatedAt }: Props) {
  const { totals, monthlyBreakdown, businessIncomeByCategory } = report
  const monthsWithActivity = monthlyBreakdown.filter((m) => m.totalTransactions > 0)
  const netPositive = totals.net >= 0
  const topIncomeSources = bucketItems(
    businessIncomeByCategory.filter((c) => c.category !== "Uncategorized"),
    6
  )

  return (
    <Document title={`Tax Report ${year}`} author="GRW CRM">
      {/* ── Cover Page ─────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Annual Tax Report</Text>
        <Text style={styles.subtitle}>
          {year} · {totals.totalTransactions} transactions across {monthlyBreakdown.length} months · Generated {generatedAt}
        </Text>

        {/* YTD Stat Grid */}
        <View style={styles.statGrid}>
          <StatCard label="Business Income" value={fmt(totals.serviceIncome)} color={COLORS.emerald} />
          <StatCard label="Business Expenses" value={fmt(totals.businessExpenses)} color={COLORS.red} />
          <StatCard
            label="Net (Biz Income - Biz Exp.)"
            value={fmt(totals.net)}
            color={netPositive ? COLORS.emerald : COLORS.red}
            bg={netPositive ? COLORS.bgEmerald : COLORS.bgRed}
          />
          <StatCard
            label="Uncategorized"
            value={String(totals.uncategorizedCount)}
            color={totals.uncategorizedCount === 0 ? COLORS.emerald : COLORS.orange}
          />
        </View>

        {/* Monthly Breakdown Table */}
        <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.thMonth}>MONTH</Text>
            <Text style={styles.thNum}>BIZ INCOME</Text>
            <Text style={styles.thNum}>BIZ EXP.</Text>
            <Text style={styles.thNum}>NET</Text>
          </View>
          {monthlyBreakdown.map((m) => (
            <View key={m.month} style={styles.tableRow}>
              <Text style={styles.tdMonth}>{formatMonthLong(m.month)}</Text>
              <Text style={styles.tdNum}>{fmt(m.serviceIncome)}</Text>
              <Text style={[styles.tdNum, { color: COLORS.red }]}>{fmt(m.businessExpenses)}</Text>
              <Text
                style={[
                  styles.tdNum,
                  { color: m.net >= 0 ? COLORS.emerald : COLORS.red, fontFamily: "Helvetica-Bold" },
                ]}
              >
                {m.net >= 0 ? "+" : ""}
                {fmt(m.net)}
              </Text>
            </View>
          ))}
          <View style={styles.tableTotalRow}>
            <Text style={[styles.tdMonth, { fontFamily: "Helvetica-Bold" }]}>Total</Text>
            <Text style={[styles.tdNum, { fontFamily: "Helvetica-Bold" }]}>{fmt(totals.serviceIncome)}</Text>
            <Text style={[styles.tdNum, { color: COLORS.red, fontFamily: "Helvetica-Bold" }]}>
              {fmt(totals.businessExpenses)}
            </Text>
            <Text
              style={[
                styles.tdNum,
                { color: netPositive ? COLORS.emerald : COLORS.red, fontFamily: "Helvetica-Bold" },
              ]}
            >
              {netPositive ? "+" : ""}
              {fmt(totals.net)}
            </Text>
          </View>
        </View>

        {topIncomeSources.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <Text style={styles.sectionTitle}>Top Business Income Sources (YTD)</Text>
            <CategoryLegend items={topIncomeSources} />
          </View>
        )}

        <Text style={styles.pageFooter}>Annual Tax Report · {year}</Text>
      </Page>

      {/* ── Per-Month Pages ────────────────────────────────── */}
      {monthsWithActivity.map((m) => (
        <MonthPage key={m.month} month={m} year={year} />
      ))}

    </Document>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  bg,
}: {
  label: string
  value: string
  color?: string
  bg?: string
}) {
  return (
    <View style={[styles.statCard, bg ? { backgroundColor: bg } : {}]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
    </View>
  )
}

function MonthPage({ month, year }: { month: MonthBreakdown; year: string }) {
  const netPositive = month.net >= 0
  const bizCats = bucketItems(month.businessByCategory.filter((c) => c.category !== "Uncategorized"), 6)
  const bizIncomeCats = bucketItems(month.businessIncomeByCategory.filter((c) => c.category !== "Uncategorized"), 6)

  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.monthHeader}>{formatMonthLong(month.month)}</Text>
      <Text style={styles.monthSub}>
        {month.totalTransactions} transaction{month.totalTransactions === 1 ? "" : "s"}
        {month.uncategorizedCount > 0 ? ` · ${month.uncategorizedCount} uncategorized` : " · 100% categorized"}
      </Text>

      {/* Stat row */}
      <View style={styles.statGrid}>
        <StatCard label="Business Income" value={fmt(month.serviceIncome)} color={COLORS.emerald} />
        <StatCard label="Business Expenses" value={fmt(month.businessExpenses)} color={COLORS.red} />
        <StatCard
          label="Net"
          value={fmt(month.net)}
          color={netPositive ? COLORS.emerald : COLORS.red}
          bg={netPositive ? COLORS.bgEmerald : COLORS.bgRed}
        />
      </View>

      {/* Charts row: bar (left) + pie (right) */}
      <View style={styles.chartRow}>
        <View style={styles.chartBox}>
          <Text style={styles.chartLabel}>Business Income vs. Expenses</Text>
          <IncomeExpenseBars income={month.serviceIncome} expenses={month.businessExpenses} />
        </View>
        <View style={styles.chartBox}>
          <Text style={styles.chartLabel}>Business Expenses by Category</Text>
          <CategoryPie items={bizCats} />
        </View>
      </View>

      {bizIncomeCats.length > 0 && (
        <View style={{ marginTop: 6 }}>
          <Text style={styles.sectionTitle}>Business Income by Source</Text>
          <CategoryLegend items={bizIncomeCats} />
        </View>
      )}

      {/* Category list under the pie */}
      {bizCats.length > 0 && (
        <View style={{ marginTop: 6 }}>
          <Text style={styles.sectionTitle}>Top Business Expense Categories</Text>
          <CategoryLegend items={bizCats} />
        </View>
      )}


      <Text style={styles.pageFooter}>Annual Tax Report · {year}</Text>
    </Page>
  )
}

function CategoryLegend({
  items,
}: {
  items: { category: string; total: number }[]
}) {
  const total = items.reduce((s, c) => s + c.total, 0)
  return (
    <View>
      {items.map((c, i) => {
        const pct = total > 0 ? Math.round((c.total / total) * 100) : 0
        return (
          <View key={c.category} style={styles.legendRow}>
            <View
              style={[styles.legendSwatch, { backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }]}
            />
            <Text style={styles.legendName}>{c.category}</Text>
            <Text style={styles.legendValue}>
              {fmtExact(c.total)} ({pct}%)
            </Text>
          </View>
        )
      })}
    </View>
  )
}
