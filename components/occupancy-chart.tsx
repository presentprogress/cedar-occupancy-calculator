"use client"

// Color lookup matching the canvas room palette (stroke colors)
const SPACE_COLORS: Record<string, string> = {
  "Swimming Pool (Water Surface)":  "#2563eb",
  "Spa/Hot Tub (Water Surface)":    "#1d4ed8",
  "Cold Plunge (Water Surface)":    "#0284c7",
  "Pool Deck":                      "#d97706",
  "Exercise Room (Equipment)":      "#16a34a",
  "Exercise Room (Concentrated)":   "#059669",
  "Sauna/Steam Room":               "#dc2626",
  "Locker Room":                    "#64748b",
  "Lobby/Reception":                "#15803d",
  "Restroom":                       "#64748b",
  "Circulation":                    "#6b7280",
  "Lounge/Seating Area":            "#c2410c",
  "Storage":                        "#9ca3af",
  "Mechanical":                     "#9ca3af",
  "Office":                         "#b45309",
}
const FALLBACK_COLORS = [
  "#2563eb","#d97706","#16a34a","#dc2626","#0284c7",
  "#7c3aed","#059669","#c2410c","#0369a1","#b45309",
]

interface SpaceSegment {
  id: string
  name: string
  type: string
  occupancy: number
}

interface OccupancyChartProps {
  segments: SpaceSegment[]
  autoDeckOcc: number
  totalOccupancy: number
}

export function OccupancyChart({ segments, autoDeckOcc, totalOccupancy }: OccupancyChartProps) {
  if (totalOccupancy === 0) return null

  // Build display segments from non-zero contributors
  const activeSegments: { label: string; occ: number; color: string }[] = []
  let colorFallbackIdx = 0

  for (const s of segments) {
    if (s.occupancy <= 0) continue
    const color = SPACE_COLORS[s.type] ?? FALLBACK_COLORS[colorFallbackIdx++ % FALLBACK_COLORS.length]
    activeSegments.push({ label: s.name, occ: s.occupancy, color })
  }
  if (autoDeckOcc > 0) {
    activeSegments.push({ label: "Pool Deck (Auto)", occ: autoDeckOcc, color: "#d97706" })
  }

  if (activeSegments.length === 0) return null

  // SVG donut
  const R = 52        // outer radius
  const r = 32        // inner radius (hole)
  const CX = 68, CY = 68
  const SIZE = 136

  let cumAngle = -Math.PI / 2  // start at top
  const paths: { d: string; color: string; pct: number; label: string; occ: number }[] = []

  for (const seg of activeSegments) {
    const pct = seg.occ / totalOccupancy
    const angle = pct * 2 * Math.PI
    const x1o = CX + R * Math.cos(cumAngle)
    const y1o = CY + R * Math.sin(cumAngle)
    const x1i = CX + r * Math.cos(cumAngle)
    const y1i = CY + r * Math.sin(cumAngle)
    cumAngle += angle
    const x2o = CX + R * Math.cos(cumAngle)
    const y2o = CY + R * Math.sin(cumAngle)
    const x2i = CX + r * Math.cos(cumAngle)
    const y2i = CY + r * Math.sin(cumAngle)
    const large = angle > Math.PI ? 1 : 0
    const d = [
      `M ${x1o} ${y1o}`,
      `A ${R} ${R} 0 ${large} 1 ${x2o} ${y2o}`,
      `L ${x2i} ${y2i}`,
      `A ${r} ${r} 0 ${large} 0 ${x1i} ${y1i}`,
      "Z",
    ].join(" ")
    paths.push({ d, color: seg.color, pct, label: seg.label, occ: seg.occ })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Occupancy Breakdown
        </p>
      </div>
      <div className="flex items-center gap-6 px-4 py-4">
        {/* Donut */}
        <div className="shrink-0">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            {paths.map((p, i) => (
              <path key={i} d={p.d} fill={p.color} opacity={0.85} />
            ))}
            {/* Center label */}
            <text x={CX} y={CY - 4} textAnchor="middle" fontSize={20} fontWeight="800"
              fontFamily="'Geist',sans-serif" fill="currentColor">
              {totalOccupancy}
            </text>
            <text x={CX} y={CY + 12} textAnchor="middle" fontSize={9}
              fontFamily="'Geist Mono',monospace" fill="currentColor" opacity={0.5}>
              persons
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {paths.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{p.label}</span>
              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums">{p.occ}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                {Math.round(p.pct * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
