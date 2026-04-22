"use client"

import { useRef, useState, useMemo, useCallback } from "react"
import { IBC_LOAD_FACTORS } from "@/lib/types"
import type { EquipmentItem, SpaceArea, SpaceLayout } from "@/lib/types"

// ─── Scale ────────────────────────────────────────────────────────────────────
const PX = 12        // pixels per foot
const SNAP = 0.5     // snap grid in feet
const MIN_FT = 2     // minimum room dimension

// ─── Colours ─────────────────────────────────────────────────────────────────
type ColorSet = { fill: string; stroke: string; text: string }

const LIGHT: Record<string, ColorSet> = {
  "Swimming Pool (Water Surface)":  { fill: "#dbeafe", stroke: "#2563eb", text: "#1e40af" },
  "Pool Deck":                      { fill: "#fef3c7", stroke: "#d97706", text: "#92400e" },
  "Exercise Room (Equipment)":      { fill: "#dcfce7", stroke: "#16a34a", text: "#15803d" },
  "Exercise Room (Concentrated)":   { fill: "#d1fae5", stroke: "#059669", text: "#065f46" },
  "Sauna/Steam Room":               { fill: "#fee2e2", stroke: "#dc2626", text: "#991b1b" },
  "Cold Plunge (Water Surface)":    { fill: "#e0f2fe", stroke: "#0284c7", text: "#0c4a6e" },
  "Spa/Hot Tub (Water Surface)":    { fill: "#ede9fe", stroke: "#7c3aed", text: "#4c1d95" },
  "Locker Room":                    { fill: "#e0f2fe", stroke: "#0369a1", text: "#0c4a6e" },
  "Lobby/Reception":                { fill: "#f0fdf4", stroke: "#15803d", text: "#14532d" },
  "Restroom":                       { fill: "#f5f3ff", stroke: "#7c3aed", text: "#4c1d95" },
  "Circulation":                    { fill: "#f3f4f6", stroke: "#6b7280", text: "#374151" },
  "Lounge/Seating Area":            { fill: "#fff7ed", stroke: "#c2410c", text: "#7c2d12" },
  "Storage":                        { fill: "#f9fafb", stroke: "#9ca3af", text: "#6b7280" },
  "Mechanical":                     { fill: "#f9fafb", stroke: "#9ca3af", text: "#6b7280" },
  "Office":                         { fill: "#fffbeb", stroke: "#b45309", text: "#78350f" },
}

const DARK: Record<string, ColorSet> = {
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

const FALLBACK_LIGHT: ColorSet = { fill: "#f3f4f6", stroke: "#6b7280", text: "#374151" }
const FALLBACK_DARK: ColorSet  = { fill: "#141414", stroke: "#374151", text: "#9ca3af" }

const EQUIP_PALETTE = [
  "#f59e0b","#10b981","#3b82f6","#a78bfa",
  "#f472b6","#34d399","#fb923c","#60a5fa",
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ftToArch(ft: number): string {
  const whole = Math.floor(ft)
  const inches = Math.round((ft - whole) * 12)
  return inches === 0 ? `${whole}' - 0"` : `${whole}' - ${inches}"`
}

function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP
}

function isGym(type: string) {
  return type === "Exercise Room (Equipment)" || type === "Exercise Room (Concentrated)"
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Handle = "left" | "right" | "top" | "bottom" | "move"

interface DragState {
  id: string
  handle: Handle
  startX: number   // cursor position in feet at drag start
  startY: number
  startLayout: SpaceLayout
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface SpacePlannerProps {
  spaces: SpaceArea[]
  equipment: EquipmentItem[]
  spaceLayouts: Record<string, SpaceLayout>
  isDark: boolean
  onSpaceResize: (id: string, layout: SpaceLayout) => void
}

export function SpacePlanner({
  spaces,
  equipment,
  spaceLayouts,
  isDark,
  onSpaceResize,
}: SpacePlannerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [localLayouts, setLocalLayouts] = useState<Record<string, SpaceLayout>>(spaceLayouts)
  const [selected, setSelected] = useState<string | null>(null)

  // Sync when parent loads a new version
  const prevLayouts = useRef(spaceLayouts)
  if (spaceLayouts !== prevLayouts.current) {
    prevLayouts.current = spaceLayouts
    setLocalLayouts(spaceLayouts)
  }

  const palette = isDark ? DARK : LIGHT
  const fallback = isDark ? FALLBACK_DARK : FALLBACK_LIGHT
  const gridColor = isDark ? "#131b2e" : "#e5e7eb"
  const bgColor   = isDark ? "#080c17" : "#f8fafc"
  const dimColor  = isDark ? "#4b5563" : "#9ca3af"
  const occAmber  = isDark ? "#f59e0b" : "#d97706"

  // Equipment totals per item
  const equipByItem = useMemo(() =>
    equipment.map((item) => {
      const shared = item.sharedClearance ?? 0
      const unit = item.footprint + item.accessSpace
      return { ...item, totalSpace: unit * item.quantity - shared * Math.max(0, item.quantity - 1) }
    }),
    [equipment]
  )

  // Canvas size: bounding box of all rooms + padding
  const { svgW, svgH } = useMemo(() => {
    let maxX = 60, maxY = 80
    for (const l of Object.values(localLayouts)) {
      maxX = Math.max(maxX, l.x + l.w + 8)
      maxY = Math.max(maxY, l.y + l.h + 8)
    }
    return { svgW: maxX * PX, svgH: maxY * PX }
  }, [localLayouts])

  // ── Pointer helpers ─────────────────────────────────────────────────────────
  const toFeet = useCallback((e: React.PointerEvent): { x: number; y: number } => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / PX, y: (e.clientY - r.top) / PX }
  }, [])

  function startDrag(e: React.PointerEvent<SVGElement>, id: string, handle: Handle) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const ft = toFeet(e)
    setDrag({ id, handle, startX: ft.x, startY: ft.y, startLayout: { ...localLayouts[id] } })
    setSelected(id)
  }

  function onSvgMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return
    const ft = toFeet(e)
    const dx = snap(ft.x - drag.startX)
    const dy = snap(ft.y - drag.startY)
    const { x, y, w, h } = drag.startLayout

    let nl: SpaceLayout
    switch (drag.handle) {
      case "left":   nl = { x: Math.max(0, x + dx), y, w: Math.max(MIN_FT, w - dx), h }; break
      case "right":  nl = { x, y, w: Math.max(MIN_FT, w + dx), h }; break
      case "top":    nl = { x, y: Math.max(0, y + dy), w, h: Math.max(MIN_FT, h - dy) }; break
      case "bottom": nl = { x, y, w, h: Math.max(MIN_FT, h + dy) }; break
      default:       nl = { x: Math.max(0, x + dx), y: Math.max(0, y + dy), w, h }
    }
    setLocalLayouts(prev => ({ ...prev, [drag.id]: nl }))
  }

  function onSvgUp() {
    if (!drag) return
    onSpaceResize(drag.id, localLayouts[drag.id])
    setDrag(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const px = (ft: number) => ft * PX

  return (
    <div className="overflow-auto rounded-b-xl" style={{ background: bgColor }}>
      <svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        className="block select-none"
        onPointerMove={onSvgMove}
        onPointerUp={onSvgUp}
        onPointerLeave={onSvgUp}
        onClick={() => setSelected(null)}
      >
        <defs>
          {/* 1-ft minor grid */}
          <pattern id="grid1" width={PX} height={PX} patternUnits="userSpaceOnUse">
            <path d={`M ${PX} 0 L 0 0 0 ${PX}`} fill="none" stroke={gridColor} strokeWidth="0.4" />
          </pattern>
          {/* 10-ft major grid */}
          <pattern id="grid10" width={PX * 10} height={PX * 10} patternUnits="userSpaceOnUse">
            <rect width={PX * 10} height={PX * 10} fill="url(#grid1)" />
            <path d={`M ${PX * 10} 0 L 0 0 0 ${PX * 10}`} fill="none" stroke={gridColor} strokeWidth="1" strokeOpacity="0.6" />
          </pattern>
        </defs>

        {/* Background */}
        <rect width={svgW} height={svgH} fill={bgColor} />
        <rect width={svgW} height={svgH} fill="url(#grid10)" />

        {/* Rooms */}
        {spaces.map((space) => {
          const layout = localLayouts[space.id]
          if (!layout) return null

          const colors = palette[space.type] ?? fallback
          const rx = px(layout.x), ry = px(layout.y)
          const rw = px(layout.w), rh = px(layout.h)
          const cx = rx + rw / 2, cy = ry + rh / 2
          const isSel = selected === space.id
          const isDragging = drag?.id === space.id

          const occ = Math.ceil(space.squareFeet / IBC_LOAD_FACTORS[space.type])
          const gymSpace = isGym(space.type)
          const totalGymSF = space.squareFeet

          // Equipment tile heights
          const equipRowH = gymSpace && equipByItem.length > 0 ? Math.min(rh * 0.35, 40) : 0

          // Handle appearance
          const HLONG = 28, HSHORT = 8, HRADIUS = 3
          const hFill = isDark ? "#1e293b" : "#ffffff"
          const hStroke = colors.stroke

          return (
            <g key={space.id}>
              {/* Room body */}
              <rect
                x={rx} y={ry} width={rw} height={rh}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={isSel ? 2.5 : 1.5}
                strokeDasharray={space.isConditioned ? undefined : "6 3"}
                rx={3}
                style={{ cursor: isDragging ? "grabbing" : "grab" }}
                onPointerDown={(e) => startDrag(e, space.id, "move")}
              />

              {/* Conditioned accent bar */}
              {space.isConditioned && (
                <rect x={rx + 3} y={ry} width={rw - 6} height={3}
                  fill={colors.stroke} fillOpacity={0.5} rx={1.5} pointerEvents="none" />
              )}

              {/* Labels */}
              {rw > 30 && rh > 24 && (
                <g pointerEvents="none">
                  <text x={cx} y={ry + Math.min(22, rh * 0.18)}
                    textAnchor="middle" fontSize={Math.min(12, Math.max(8, rw / 9))}
                    fill={colors.text} fontWeight="700" fontFamily="system-ui,sans-serif">
                    {rw > 80 ? space.name : space.name.split(" ")[0]}
                  </text>
                  {rh > 50 && rw > 44 && (
                    <text x={cx} y={ry + Math.min(36, rh * 0.28)}
                      textAnchor="middle" fontSize={Math.min(10, Math.max(7, rw / 13))}
                      fill={colors.text} opacity={0.65} fontFamily="'Geist Mono',monospace">
                      {space.squareFeet.toLocaleString()} SF
                    </text>
                  )}
                  {/* Occupancy — amber, bottom of zone */}
                  <text x={cx} y={ry + rh - equipRowH - 14}
                    textAnchor="middle" fontSize={Math.min(18, Math.max(9, rw / 5.5))}
                    fill={occAmber} fontWeight="800" fontFamily="'Geist Mono',monospace">
                    {occ}
                  </text>
                  {rw > 40 && (
                    <text x={cx} y={ry + rh - equipRowH - 4}
                      textAnchor="middle" fontSize={7}
                      fill={colors.text} opacity={0.45} fontFamily="'Geist Mono',monospace">
                      OCC
                    </text>
                  )}
                </g>
              )}

              {/* Equipment tiles within gym zone */}
              {gymSpace && equipRowH > 0 && (() => {
                let ex = rx + 2
                const tileY = ry + rh - equipRowH + 2
                const tileH = equipRowH - 4
                return equipByItem.map((item, i) => {
                  const frac = totalGymSF > 0 ? item.totalSpace / totalGymSF : 0
                  const tw = Math.max(2, frac * (rw - 4) - 1.5)
                  const color = EQUIP_PALETTE[i % EQUIP_PALETTE.length]
                  const el = (
                    <g key={item.id} pointerEvents="none">
                      <rect x={ex} y={tileY} width={tw} height={tileH}
                        fill={color} fillOpacity={0.28} stroke={color} strokeWidth={0.7} rx={2} />
                      {tw > 28 && (
                        <text x={ex + tw / 2} y={tileY + tileH / 2 + 3}
                          textAnchor="middle" fontSize={Math.min(8, tw / 4)}
                          fill={color} fontWeight="600" fontFamily="system-ui,sans-serif">
                          {item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name}
                        </text>
                      )}
                    </g>
                  )
                  ex += tw + 1.5
                  return el
                })
              })()}

              {/* ── Resize handles (always visible when selected, hover otherwise) ── */}
              {/* Left */}
              <rect
                x={rx - HSHORT / 2} y={cy - HLONG / 2}
                width={HSHORT} height={HLONG}
                fill={hFill} stroke={hStroke} strokeWidth={1.5} rx={HRADIUS}
                style={{ cursor: "ew-resize" }}
                className={isSel ? "" : "opacity-0 hover:opacity-100"}
                onPointerDown={(e) => startDrag(e, space.id, "left")}
              />
              {/* Right */}
              <rect
                x={rx + rw - HSHORT / 2} y={cy - HLONG / 2}
                width={HSHORT} height={HLONG}
                fill={hFill} stroke={hStroke} strokeWidth={1.5} rx={HRADIUS}
                style={{ cursor: "ew-resize" }}
                className={isSel ? "" : "opacity-0 hover:opacity-100"}
                onPointerDown={(e) => startDrag(e, space.id, "right")}
              />
              {/* Top */}
              <rect
                x={cx - HLONG / 2} y={ry - HSHORT / 2}
                width={HLONG} height={HSHORT}
                fill={hFill} stroke={hStroke} strokeWidth={1.5} rx={HRADIUS}
                style={{ cursor: "ns-resize" }}
                className={isSel ? "" : "opacity-0 hover:opacity-100"}
                onPointerDown={(e) => startDrag(e, space.id, "top")}
              />
              {/* Bottom */}
              <rect
                x={cx - HLONG / 2} y={ry + rh - HSHORT / 2}
                width={HLONG} height={HSHORT}
                fill={hFill} stroke={hStroke} strokeWidth={1.5} rx={HRADIUS}
                style={{ cursor: "ns-resize" }}
                className={isSel ? "" : "opacity-0 hover:opacity-100"}
                onPointerDown={(e) => startDrag(e, space.id, "bottom")}
              />

              {/* Dimension callouts when selected */}
              {isSel && (
                <g pointerEvents="none" fontSize={9} fontFamily="'Geist Mono',monospace" fill={dimColor}>
                  {/* Width at bottom */}
                  <line x1={rx} y1={ry + rh + 14} x2={rx + rw} y2={ry + rh + 14}
                    stroke={dimColor} strokeWidth={0.75} />
                  <line x1={rx} y1={ry + rh + 10} x2={rx} y2={ry + rh + 18}
                    stroke={dimColor} strokeWidth={0.75} />
                  <line x1={rx + rw} y1={ry + rh + 10} x2={rx + rw} y2={ry + rh + 18}
                    stroke={dimColor} strokeWidth={0.75} />
                  <text x={cx} y={ry + rh + 25} textAnchor="middle">{ftToArch(layout.w)}</text>
                  {/* Height at right */}
                  <line x1={rx + rw + 14} y1={ry} x2={rx + rw + 14} y2={ry + rh}
                    stroke={dimColor} strokeWidth={0.75} />
                  <line x1={rx + rw + 10} y1={ry} x2={rx + rw + 18} y2={ry}
                    stroke={dimColor} strokeWidth={0.75} />
                  <line x1={rx + rw + 10} y1={ry + rh} x2={rx + rw + 18} y2={ry + rh}
                    stroke={dimColor} strokeWidth={0.75} />
                  <text
                    x={rx + rw + 26} y={cy + 3}
                    textAnchor="middle"
                    transform={`rotate(-90 ${rx + rw + 26} ${cy})`}>
                    {ftToArch(layout.h)}
                  </text>
                </g>
              )}
            </g>
          )
        })}

        {/* Scale bar */}
        <g transform={`translate(12, ${svgH - 22})`}>
          <rect x={0} y={0} width={PX * 10} height={4} fill={dimColor} fillOpacity={0.5} />
          <rect x={0} y={0} width={PX * 5} height={4} fill={dimColor} fillOpacity={0.8} />
          <text x={0} y={13} fontSize={7.5} fill={dimColor} fontFamily="'Geist Mono',monospace">0</text>
          <text x={PX * 5 - 4} y={13} fontSize={7.5} fill={dimColor} fontFamily="'Geist Mono',monospace">5'</text>
          <text x={PX * 10 - 4} y={13} fontSize={7.5} fill={dimColor} fontFamily="'Geist Mono',monospace">10'</text>
        </g>
      </svg>
    </div>
  )
}
