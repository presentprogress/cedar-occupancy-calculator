"use client"

import { useMemo } from "react"
import { IBC_LOAD_FACTORS } from "@/lib/types"
import type { EquipmentItem, SpaceArea } from "@/lib/types"

const EQUIP_PALETTE = [
  "#f59e0b", "#10b981", "#3b82f6", "#a78bfa", "#f472b6",
  "#34d399", "#fb923c", "#60a5fa", "#e879f9", "#2dd4bf",
]

const SPACE_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  "Swimming Pool (Water Surface)":  { fill: "#0b1e3d", stroke: "#3b82f6", text: "#93c5fd" },
  "Pool Deck":                      { fill: "#271800", stroke: "#d97706", text: "#fbbf24" },
  "Exercise Room (Equipment)":      { fill: "#0a1e0e", stroke: "#16a34a", text: "#86efac" },
  "Exercise Room (Concentrated)":   { fill: "#0a1e11", stroke: "#059669", text: "#6ee7b7" },
  "Sauna/Steam Room":               { fill: "#280a0a", stroke: "#dc2626", text: "#fca5a5" },
  "Cold Plunge (Water Surface)":    { fill: "#091c2d", stroke: "#0284c7", text: "#7dd3fc" },
  "Spa/Hot Tub (Water Surface)":    { fill: "#18092a", stroke: "#7c3aed", text: "#c4b5fd" },
  "Locker Room":                    { fill: "#091827", stroke: "#0369a1", text: "#7dd3fc" },
  "Lobby/Reception":                { fill: "#091a0e", stroke: "#15803d", text: "#86efac" },
  "Restroom":                       { fill: "#13092a", stroke: "#7c3aed", text: "#c4b5fd" },
  "Circulation":                    { fill: "#141414", stroke: "#4b5563", text: "#9ca3af" },
  "Lounge/Seating Area":            { fill: "#271200", stroke: "#c2410c", text: "#fb923c" },
  "Storage":                        { fill: "#101010", stroke: "#374151", text: "#6b7280" },
  "Mechanical":                     { fill: "#101010", stroke: "#374151", text: "#6b7280" },
  "Office":                         { fill: "#1a1300", stroke: "#b45309", text: "#fbbf24" },
}

const FALLBACK_COLORS = { fill: "#141414", stroke: "#374151", text: "#9ca3af" }

function isGymType(type: string) {
  return type === "Exercise Room (Equipment)" || type === "Exercise Room (Concentrated)"
}

interface SpacePlannerProps {
  equipment: EquipmentItem[]
  spaces: SpaceArea[]
  // Legacy props kept for backward-compat with saved versions
  storedPositions?: Record<string, { x: number; y: number }>
  onPositionsChange?: (p: Record<string, { x: number; y: number }>) => void
}

export function SpacePlanner({ equipment, spaces }: SpacePlannerProps) {
  const totalSF = spaces.reduce((s, sp) => s + sp.squareFeet, 0)

  const equipByItem = useMemo(() =>
    equipment.map((item) => {
      const shared = item.sharedClearance ?? 0
      const unit = item.footprint + item.accessSpace
      const totalSpace = unit * item.quantity - shared * Math.max(0, item.quantity - 1)
      return { ...item, totalSpace }
    }),
    [equipment]
  )

  const totalEquipSF = useMemo(() =>
    equipByItem.reduce((s, e) => s + e.totalSpace, 0),
    [equipByItem]
  )

  if (totalSF === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Add spaces to see the floor plan
      </div>
    )
  }

  // ── Canvas geometry ────────────────────────────────────────────────────────
  const VW = 1000          // base viewBox width units
  const ZONE_H = 180       // height of each space zone
  const EQUIP_H = 80       // height of equipment sub-zone
  const GAP = 4            // gap between zone strips
  const MIN_W = 16         // minimum zone width

  const hasGym = spaces.some((s) => isGymType(s.type))
  const VH = hasGym ? ZONE_H + EQUIP_H + 20 : ZONE_H + 12

  let cx = 0
  const strips = spaces.map((space) => {
    const w = Math.max(MIN_W, (space.squareFeet / totalSF) * VW)
    const strip = { space, x: cx, w }
    cx += w + GAP
    return strip
  })
  const totalW = Math.max(VW + 8, cx + 4)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="overflow-x-auto" style={{ background: "#080c17" }}>
      <svg
        viewBox={`0 0 ${totalW} ${VH}`}
        width={totalW}
        height={VH}
        className="block"
        aria-label="Amenity space floor plan"
      >
        <defs>
          <pattern id="sc-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#131b2e" strokeWidth="0.6" />
          </pattern>
          <pattern id="uncond-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#2a3040" strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* Background */}
        <rect width={totalW} height={VH} fill="#080c17" />
        <rect width={totalW} height={VH} fill="url(#sc-grid)" />

        {strips.map(({ space, x, w }) => {
          const colors = SPACE_COLORS[space.type] ?? FALLBACK_COLORS
          const loadFactor = IBC_LOAD_FACTORS[space.type]
          const occupancy = Math.ceil(space.squareFeet / loadFactor)
          const gym = isGymType(space.type)
          const zoneH = gym ? ZONE_H : ZONE_H + 4
          const Y = 4
          const gymSF = space.squareFeet

          const nameFontSize = Math.min(13, Math.max(7, w / 9))
          const sfFontSize = Math.min(10, Math.max(6, w / 14))
          const occFontSize = Math.min(18, Math.max(8, w / 6))

          return (
            <g key={space.id}>
              {/* Zone body */}
              <rect
                x={x} y={Y}
                width={w} height={zoneH}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={space.isConditioned ? 1.5 : 1}
                strokeDasharray={space.isConditioned ? undefined : "5 3"}
                rx={4}
              />

              {/* Unconditioned hatch overlay */}
              {!space.isConditioned && (
                <rect
                  x={x} y={Y}
                  width={w} height={zoneH}
                  fill="url(#uncond-hatch)"
                  rx={4}
                  pointerEvents="none"
                />
              )}

              {/* Conditioned top accent bar (cyan) */}
              {space.isConditioned && (
                <rect
                  x={x + 2} y={Y}
                  width={w - 4} height={3}
                  fill="#06b6d4"
                  fillOpacity={0.55}
                  rx={2}
                />
              )}

              {/* Labels — only when wide enough */}
              {w > 28 && (
                <>
                  {/* Space name */}
                  <text
                    x={x + w / 2} y={Y + 20}
                    textAnchor="middle"
                    fontSize={nameFontSize}
                    fill={colors.text}
                    fontWeight="700"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {w > 90 ? space.name : space.name.split(" ")[0]}
                  </text>

                  {/* SF */}
                  {w > 48 && (
                    <text
                      x={x + w / 2} y={Y + 20 + nameFontSize + 5}
                      textAnchor="middle"
                      fontSize={sfFontSize}
                      fill={colors.text}
                      opacity={0.6}
                      fontFamily="'Geist Mono', monospace"
                    >
                      {space.squareFeet.toLocaleString()} SF
                    </text>
                  )}

                  {/* Occupancy count — amber, bottom of zone */}
                  <text
                    x={x + w / 2} y={Y + zoneH - 18}
                    textAnchor="middle"
                    fontSize={occFontSize}
                    fill="#f59e0b"
                    fontWeight="800"
                    fontFamily="'Geist Mono', monospace"
                  >
                    {occupancy}
                  </text>
                  {w > 44 && (
                    <text
                      x={x + w / 2} y={Y + zoneH - 6}
                      textAnchor="middle"
                      fontSize={6}
                      fill={colors.text}
                      opacity={0.45}
                      fontFamily="'Geist Mono', monospace"
                    >
                      OCC
                    </text>
                  )}
                </>
              )}

              {/* ── Equipment sub-zone (gym spaces only) ── */}
              {gym && (
                <g>
                  {/* Sub-zone border */}
                  <rect
                    x={x} y={Y + ZONE_H + 4}
                    width={w} height={EQUIP_H}
                    fill="#060e0a"
                    stroke={colors.stroke}
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    rx={3}
                  />

                  {/* "EQUIPMENT" micro-label */}
                  {w > 64 && (
                    <text
                      x={x + 6} y={Y + ZONE_H + 14}
                      fontSize={6}
                      fill={colors.text}
                      opacity={0.4}
                      fontFamily="'Geist Mono', monospace"
                      letterSpacing="0.05em"
                    >
                      EQUIPMENT
                    </text>
                  )}

                  {/* Equipment tiles — proportional to their SF within gym */}
                  {gymSF > 0 && (() => {
                    let ex = x + 2
                    const tileY = Y + ZONE_H + 18
                    const tileH = EQUIP_H - 22

                    return equipByItem.map((item, i) => {
                      const frac = item.totalSpace / gymSF
                      const tileW = Math.max(2, frac * (w - 4) - 1.5)
                      const color = EQUIP_PALETTE[i % EQUIP_PALETTE.length]
                      const tileFontSize = Math.min(9, Math.max(6, tileW / 5))

                      const el = (
                        <g key={item.id}>
                          <rect
                            x={ex} y={tileY}
                            width={tileW} height={tileH}
                            fill={color}
                            fillOpacity={0.22}
                            stroke={color}
                            strokeWidth={0.8}
                            rx={2}
                          />
                          {tileW > 26 && (
                            <>
                              <text
                                x={ex + tileW / 2}
                                y={tileY + tileH / 2 - 3}
                                textAnchor="middle"
                                fontSize={tileFontSize}
                                fill={color}
                                fontWeight="600"
                                fontFamily="system-ui, sans-serif"
                              >
                                {item.quantity > 1
                                  ? `${item.name} ×${item.quantity}`
                                  : item.name}
                              </text>
                              {tileW > 40 && (
                                <text
                                  x={ex + tileW / 2}
                                  y={tileY + tileH / 2 + 8}
                                  textAnchor="middle"
                                  fontSize={6}
                                  fill={color}
                                  opacity={0.55}
                                  fontFamily="'Geist Mono', monospace"
                                >
                                  {item.totalSpace} SF
                                </text>
                              )}
                            </>
                          )}
                        </g>
                      )
                      ex += tileW + 1.5
                      return el
                    })
                  })()}

                  {/* Overflow warning */}
                  {gymSF > 0 && totalEquipSF > gymSF && w > 60 && (
                    <text
                      x={x + w / 2}
                      y={Y + ZONE_H + EQUIP_H / 2 + 4}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#ef4444"
                      fontFamily="system-ui, sans-serif"
                    >
                      ⚠ equipment exceeds gym SF
                    </text>
                  )}
                </g>
              )}
            </g>
          )
        })}

        {/* Legend row */}
        <g transform={`translate(4, ${VH - 10})`}>
          <rect x={0} y={-5} width={10} height={3} fill="#06b6d4" fillOpacity={0.55} rx={1} />
          <text x={14} y={0} fontSize={6.5} fill="#4b5563" fontFamily="'Geist Mono', monospace">
            CONDITIONED
          </text>
          <text x={96} y={0} fontSize={6.5} fill="#4b5563" fontFamily="'Geist Mono', monospace">
            amber = occupants per IBC 1004.5 · equipment tiles proportional to SF within gym
          </text>
        </g>
      </svg>
    </div>
  )
}
