"use client"

import { useState, useRef, useMemo, useEffect } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { EquipmentItem, SpaceArea } from "@/lib/types"

// ─── Canvas constants (1 ft = 14 px) ─────────────────────────────────────────
const PX = 14                         // pixels per foot
const CW = 70                         // canvas width in feet
const EH = 40                         // equipment canvas height in feet
const SH = 22                         // space canvas height in feet
const GAP = 1.5                       // gap between items (ft)

// ─── Colour palette ───────────────────────────────────────────────────────────
const PALETTE = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#84CC16", "#06B6D4",
]

const SPACE_COLORS: Record<string, { fill: string; stroke: string }> = {
  "Swimming Pool (Water Surface)":  { fill: "#BFDBFE", stroke: "#2563EB" },
  "Pool Deck":                      { fill: "#FDE68A", stroke: "#D97706" },
  "Exercise Room (Equipment)":      { fill: "#DCFCE7", stroke: "#16A34A" },
  "Exercise Room (Concentrated)":   { fill: "#D1FAE5", stroke: "#059669" },
  "Sauna/Steam Room":               { fill: "#FEE2E2", stroke: "#DC2626" },
  "Cold Plunge (Water Surface)":    { fill: "#BAE6FD", stroke: "#0284C7" },
  "Spa/Hot Tub (Water Surface)":    { fill: "#EDE9FE", stroke: "#7C3AED" },
  "Locker Room":                    { fill: "#E0F2FE", stroke: "#0369A1" },
  "Lobby/Reception":                { fill: "#F0FDF4", stroke: "#15803D" },
  "Restroom":                       { fill: "#F5F3FF", stroke: "#7C3AED" },
  "Circulation":                    { fill: "#F3F4F6", stroke: "#6B7280" },
  "Lounge/Seating Area":            { fill: "#FFF7ED", stroke: "#C2410C" },
  "Storage":                        { fill: "#F9FAFB", stroke: "#9CA3AF" },
  "Mechanical":                     { fill: "#F9FAFB", stroke: "#9CA3AF" },
  "Office":                         { fill: "#FFFBEB", stroke: "#B45309" },
}

// ─── Types ────────────────────────────────────────────────────────────────────
type IKey = string   // `${itemId}:${instanceIndex}`
type Positions = Record<IKey, { x: number; y: number }>

interface Dims {
  fw: number      // footprint side (ft) — square model
  border: number  // clearance border per side (ft)
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────
// Given a square footprint of side w and access area A, solve for border b such
// that (w + 2b)² − w² = A  →  b = (√(w² + A) − w) / 2
function getDims(item: EquipmentItem): Dims {
  const fw = Math.sqrt(item.footprint)
  const border = item.accessSpace > 0
    ? (Math.sqrt(fw * fw + item.accessSpace) - fw) / 2
    : 0
  return { fw, border }
}

function overlapArea(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): number {
  const ox = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx))
  const oy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by))
  return ox * oy
}

// ─── Default layout ───────────────────────────────────────────────────────────
function buildDefaults(items: EquipmentItem[]): Positions {
  const pos: Positions = {}
  let cx = 2, cy = 2, rowH = 0

  for (const item of items) {
    const { fw, border } = getDims(item)
    const slotW = fw + 2 * border
    const slotH = fw + 2 * border

    for (let i = 0; i < item.quantity; i++) {
      if (cx + slotW > CW - 2 && cx > 2) {
        cx = 2
        cy += rowH + GAP
        rowH = 0
      }
      pos[`${item.id}:${i}`] = { x: cx + border, y: cy + border }
      cx += slotW + GAP
      rowH = Math.max(rowH, slotH)
    }
  }
  return pos
}

function mergeWithDefaults(items: EquipmentItem[], stored?: Positions): Positions {
  const defaults = buildDefaults(items)
  if (!stored) return defaults
  const out: Positions = {}
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      const k = `${item.id}:${i}`
      out[k] = stored[k] ?? defaults[k]
    }
  }
  return out
}

// ─── Component ────────────────────────────────────────────────────────────────
interface SpacePlannerProps {
  equipment: EquipmentItem[]
  spaces: SpaceArea[]
  storedPositions?: Positions
  onPositionsChange: (p: Positions) => void
}

export function SpacePlanner({
  equipment,
  spaces,
  storedPositions,
  onPositionsChange,
}: SpacePlannerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const storedRef = useRef(storedPositions)

  const [positions, setPositions] = useState<Positions>(() =>
    mergeWithDefaults(equipment, storedPositions)
  )
  const [drag, setDrag] = useState<{ key: IKey; ox: number; oy: number } | null>(null)

  // Resync positions when a version is loaded (storedPositions reference changes)
  useEffect(() => {
    if (storedPositions !== storedRef.current) {
      storedRef.current = storedPositions
      setPositions(mergeWithDefaults(equipment, storedPositions))
    }
  }, [storedPositions, equipment])

  // ── Derived data ────────────────────────────────────────────────────────────
  const instances = useMemo(() =>
    equipment.flatMap((item, idx) => {
      const { fw, border } = getDims(item)
      return Array.from({ length: item.quantity }, (_, i) => ({
        key: `${item.id}:${i}` as IKey,
        item,
        fw,
        border,
        color: PALETTE[idx % PALETTE.length],
        label: item.quantity > 1 ? `${item.name} ${i + 1}` : item.name,
      }))
    }),
    [equipment]
  )

  // Pairwise clearance-zone overlaps in ft²
  const overlapSF = useMemo(() => {
    const rects = instances.map(({ key, fw, border }) => {
      const p = positions[key] ?? { x: 0, y: 0 }
      const s = fw + 2 * border
      return { x: p.x - border, y: p.y - border, w: s, h: s }
    })
    let total = 0
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j]
        total += overlapArea(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h)
      }
    return total
  }, [instances, positions])

  const totalRequiredSF = useMemo(() =>
    equipment.reduce((sum, item) => {
      const shared = item.sharedClearance ?? 0
      const unit = item.footprint + item.accessSpace
      return sum + unit * item.quantity - shared * Math.max(0, item.quantity - 1)
    }, 0),
    [equipment]
  )

  const netSF = totalRequiredSF - overlapSF

  // ── Drag ────────────────────────────────────────────────────────────────────
  function toFt(e: React.PointerEvent): { x: number; y: number } {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / PX, y: (e.clientY - r.top) / PX }
  }

  function onItemDown(e: React.PointerEvent<SVGGElement>, key: IKey) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const ft = toFt(e)
    const p = positions[key]
    setDrag({ key, ox: ft.x - p.x, oy: ft.y - p.y })
  }

  function onSvgMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return
    const ft = toFt(e)
    const x = Math.max(0, Math.round((ft.x - drag.ox) * 2) / 2)
    const y = Math.max(0, Math.round((ft.y - drag.oy) * 2) / 2)
    setPositions(prev => ({ ...prev, [drag.key]: { x, y } }))
  }

  function onSvgUp() {
    if (!drag) return
    onPositionsChange(positions)
    setDrag(null)
  }

  function resetLayout() {
    const fresh = buildDefaults(equipment)
    setPositions(fresh)
    onPositionsChange(fresh)
  }

  // ── Space canvas layout ─────────────────────────────────────────────────────
  const spaceStrips = useMemo(() => {
    const DEPTH = SH - 4   // usable feet (padding top/bottom)
    let cx = 1
    return spaces.map((space) => {
      const w = space.squareFeet / DEPTH
      const strip = { space, x: cx, y: 2, w, h: DEPTH }
      cx += w + 0.15
      return strip
    })
  }, [spaces])

  const totalSpaceWidth = spaceStrips.reduce((m, s) => m + s.w + 0.15, 0)

  // ── Render helpers ──────────────────────────────────────────────────────────
  const px = (ft: number) => ft * PX

  return (
    <div className="space-y-6">
      {/* ── Equipment canvas ─────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Equipment Layout</h3>
            <p className="text-xs text-muted-foreground">Drag items to arrange · overlapping clearance zones are deducted from net SF</p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetLayout} className="gap-1.5 text-xs">
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-white dark:bg-zinc-950">
          <svg
            ref={svgRef}
            width={px(CW)}
            height={px(EH)}
            className="block select-none"
            onPointerMove={onSvgMove}
            onPointerUp={onSvgUp}
            onPointerLeave={onSvgUp}
          >
            <defs>
              <pattern id="sp-grid" width={PX} height={PX} patternUnits="userSpaceOnUse">
                <path d={`M ${PX} 0 L 0 0 0 ${PX}`} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
              </pattern>
              <pattern id="sp-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="7" stroke="#F59E0B" strokeWidth="3" strokeOpacity="0.45" />
              </pattern>
              {/* 1-ft scale indicator */}
              <g id="scale-rule">
                <rect x="0" y="0" width={PX} height="5" fill="#374151" />
                <text x={PX / 2} y="13" textAnchor="middle" fontSize="8" fill="#6B7280">1 ft</text>
              </g>
            </defs>

            {/* Background grid */}
            <rect width={px(CW)} height={px(EH)} fill="white" />
            <rect width={px(CW)} height={px(EH)} fill="url(#sp-grid)" />

            {/* Scale indicator (bottom-left) */}
            <use href="#scale-rule" x={px(1)} y={px(EH) - 22} />

            {/* Clearance-zone overlaps (rendered behind items) */}
            {instances.flatMap(({ key: kA, fw: fwA, border: bA }, ai) =>
              instances.slice(ai + 1).map(({ key: kB, fw: fwB, border: bB }) => {
                const pA = positions[kA], pB = positions[kB]
                if (!pA || !pB) return null
                const sA = fwA + 2 * bA, sB = fwB + 2 * bB
                const ox = Math.max(0,
                  Math.min(pA.x - bA + sA, pB.x - bB + sB) - Math.max(pA.x - bA, pB.x - bB))
                const oy = Math.max(0,
                  Math.min(pA.y - bA + sA, pB.y - bB + sB) - Math.max(pA.y - bA, pB.y - bB))
                if (ox <= 0 || oy <= 0) return null
                const rx = Math.max(pA.x - bA, pB.x - bB)
                const ry = Math.max(pA.y - bA, pB.y - bB)
                return (
                  <rect
                    key={`ov-${kA}-${kB}`}
                    x={px(rx)} y={px(ry)}
                    width={px(ox)} height={px(oy)}
                    fill="url(#sp-hatch)"
                    pointerEvents="none"
                  />
                )
              })
            )}

            {/* Equipment instances */}
            {instances.map(({ key, fw, border, color, label, item }) => {
              const p = positions[key]
              if (!p) return null
              const fpPx = px(fw)
              const isDragging = drag?.key === key
              const fs = Math.max(8, Math.min(12, fpPx / 4))

              return (
                <g
                  key={key}
                  onPointerDown={(e) => onItemDown(e, key)}
                  style={{ cursor: isDragging ? "grabbing" : "grab" }}
                >
                  {/* Clearance zone */}
                  <rect
                    x={px(p.x - border)} y={px(p.y - border)}
                    width={px(fw + 2 * border)} height={px(fw + 2 * border)}
                    fill={color} fillOpacity={0.07}
                    stroke={color} strokeWidth={1} strokeDasharray="5 3"
                    rx={2}
                  />
                  {/* Footprint */}
                  <rect
                    x={px(p.x)} y={px(p.y)}
                    width={fpPx} height={fpPx}
                    fill={color} fillOpacity={isDragging ? 0.55 : 0.22}
                    stroke={color} strokeWidth={1.5}
                    rx={2}
                  />
                  {/* Name */}
                  <text
                    x={px(p.x) + fpPx / 2}
                    y={px(p.y) + fpPx / 2 - fs * 0.6}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={fs} fill={color} fontWeight="600"
                    pointerEvents="none"
                  >
                    {label}
                  </text>
                  {/* SF */}
                  <text
                    x={px(p.x) + fpPx / 2}
                    y={px(p.y) + fpPx / 2 + fs * 0.8}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.max(7, fs - 2)} fill={color} opacity={0.75}
                    pointerEvents="none"
                  >
                    {item.footprint + item.accessSpace} SF
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Stats bar */}
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            Required:{" "}
            <span className="font-semibold text-foreground">
              {totalRequiredSF.toFixed(1)} SF
            </span>
          </span>
          {overlapSF > 0.5 && (
            <span className="text-muted-foreground">
              Clearance overlap:{" "}
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                −{overlapSF.toFixed(1)} SF
              </span>
            </span>
          )}
          <span className="text-muted-foreground">
            Net:{" "}
            <span className="font-semibold text-foreground">{netSF.toFixed(1)} SF</span>
          </span>
        </div>
      </div>

      {/* ── Space canvas ──────────────────────────────────────────────────── */}
      {spaces.length > 0 && (
        <div>
          <div className="mb-2">
            <h3 className="text-sm font-medium">Amenity Zones</h3>
            <p className="text-xs text-muted-foreground">
              Proportional by SF at {SH - 4} ft depth · hover for details
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-white dark:bg-zinc-950">
            <svg
              width={Math.max(px(CW), px(totalSpaceWidth + 2))}
              height={px(SH)}
              className="block"
            >
              <rect
                width={Math.max(px(CW), px(totalSpaceWidth + 2))}
                height={px(SH)}
                fill="white"
              />
              {spaceStrips.map(({ space, x, y, w, h }) => {
                const colors = SPACE_COLORS[space.type] ?? { fill: "#F3F4F6", stroke: "#9CA3AF" }
                const wpx = px(w), hpx = px(h)
                const occupancy = Math.ceil(space.squareFeet / (
                  // inline load factor lookup
                  space.type === "Swimming Pool (Water Surface)" ? 50 :
                  space.type === "Pool Deck" ? 15 :
                  space.type === "Exercise Room (Equipment)" ? 50 :
                  space.type === "Exercise Room (Concentrated)" ? 15 :
                  space.type === "Locker Room" ? 50 :
                  space.type === "Sauna/Steam Room" ? 15 :
                  space.type === "Spa/Hot Tub (Water Surface)" ? 50 :
                  space.type === "Cold Plunge (Water Surface)" ? 50 :
                  space.type === "Lobby/Reception" ? 15 :
                  space.type === "Restroom" ? 2 :
                  space.type === "Circulation" ? 15 :
                  space.type === "Lounge/Seating Area" ? 15 :
                  space.type === "Storage" ? 300 :
                  space.type === "Mechanical" ? 300 :
                  space.type === "Office" ? 100 : 50
                ))
                const fs = Math.max(8, Math.min(11, wpx / 8))
                return (
                  <g key={space.id}>
                    <rect
                      x={px(x)} y={px(y)}
                      width={wpx} height={hpx}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={1.5}
                      rx={2}
                    />
                    {wpx > 40 && (
                      <>
                        <text
                          x={px(x) + wpx / 2} y={px(y) + hpx / 2 - fs * 0.7}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={fs} fill={colors.stroke} fontWeight="600"
                        >
                          {space.name}
                        </text>
                        <text
                          x={px(x) + wpx / 2} y={px(y) + hpx / 2 + fs * 0.7}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={Math.max(7, fs - 1.5)} fill={colors.stroke} opacity={0.8}
                        >
                          {space.squareFeet.toLocaleString()} SF · {occupancy} occ
                        </text>
                      </>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}
