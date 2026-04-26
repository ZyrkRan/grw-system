import { Svg, Rect, Path, Line, Text as SvgText, G } from "@react-pdf/renderer"

export const PIE_PALETTE = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
]

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

interface BarsProps {
  income: number
  expenses: number
  width?: number
  height?: number
}

export function IncomeExpenseBars({ income, expenses, width = 220, height = 160 }: BarsProps) {
  const padding = { top: 24, right: 16, bottom: 36, left: 16 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom
  const max = Math.max(income, expenses, 1)
  const barW = chartW / 4
  const gap = barW
  const totalBarsW = barW * 2 + gap
  const startX = padding.left + (chartW - totalBarsW) / 2
  const baseline = padding.top + chartH

  const bars = [
    { x: startX, h: (income / max) * chartH, fill: "#10b981", label: "Income", value: income },
    { x: startX + barW + gap, h: (expenses / max) * chartH, fill: "#ef4444", label: "Expenses", value: expenses },
  ]

  return (
    <Svg width={width} height={height}>
      <Line
        x1={padding.left}
        y1={baseline}
        x2={padding.left + chartW}
        y2={baseline}
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      {bars.map((b, i) => (
        <G key={i}>
          <Rect x={b.x} y={baseline - b.h} width={barW} height={b.h} fill={b.fill} />
          <SvgText
            x={b.x + barW / 2}
            y={baseline - b.h - 6}
            style={{ fontSize: 8, textAnchor: "middle" }}
            fill="#0f172a"
          >
            {fmtCompact(b.value)}
          </SvgText>
          <SvgText
            x={b.x + barW / 2}
            y={baseline + 14}
            style={{ fontSize: 7, textAnchor: "middle" }}
            fill="#64748b"
          >
            {b.label}
          </SvgText>
        </G>
      ))}
    </Svg>
  )
}

interface PieItem {
  category: string
  total: number
}

interface PieProps {
  items: PieItem[]
  size?: number
}

// Pie/donut chart with up to 6 slices + an "Other" bucket. Legend rendered to
// the right of the pie inside the same Svg so the whole chart is one component.
export function CategoryPie({ items, size = 220 }: PieProps) {
  const sliceItems = bucketItems(items, 6)
  const total = sliceItems.reduce((s, i) => s + i.total, 0)

  const pieSize = size
  const cx = pieSize / 2
  const cy = pieSize / 2
  const r = pieSize / 2 - 8

  if (total <= 0 || sliceItems.length === 0) {
    return (
      <Svg width={pieSize} height={pieSize}>
        <SvgText
          x={cx}
          y={cy}
          style={{ fontSize: 9, textAnchor: "middle" }}
          fill="#94a3b8"
        >
          No data
        </SvgText>
      </Svg>
    )
  }

  // Single-slice case: full circle (Path arcs can't draw 360°).
  if (sliceItems.length === 1) {
    return (
      <Svg width={pieSize} height={pieSize}>
        <Path
          d={`M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`}
          fill={PIE_PALETTE[0]}
        />
      </Svg>
    )
  }

  let acc = 0
  const slices = sliceItems.map((item, idx) => {
    const start = (acc / total) * Math.PI * 2
    acc += item.total
    const end = (acc / total) * Math.PI * 2
    const large = end - start > Math.PI ? 1 : 0
    const x1 = cx + r * Math.sin(start)
    const y1 = cy - r * Math.cos(start)
    const x2 = cx + r * Math.sin(end)
    const y2 = cy - r * Math.cos(end)
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
    return { d, color: PIE_PALETTE[idx % PIE_PALETTE.length], item }
  })

  return (
    <Svg width={pieSize} height={pieSize}>
      <G>
        {slices.map((s, i) => (
          <Path key={i} d={s.d} fill={s.color} />
        ))}
      </G>
    </Svg>
  )
}

// Helper: keep top N items, bucket the rest into "Other".
export function bucketItems(items: PieItem[], topN: number): PieItem[] {
  if (items.length <= topN) return items
  const top = items.slice(0, topN)
  const rest = items.slice(topN)
  const otherTotal = rest.reduce((s, i) => s + i.total, 0)
  if (otherTotal > 0) top.push({ category: "Other", total: otherTotal })
  return top
}
