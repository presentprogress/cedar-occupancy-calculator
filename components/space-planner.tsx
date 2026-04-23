"use client"

import { useRef, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { RotateCcw } from "lucide-react"
import { IBC_LOAD_FACTORS, rectsOverlap } from "@/lib/types"
import type { EquipmentItem, SpaceArea, SpaceLayout } from "@/lib/types"

// ─── Scale & constants ────────────────────────────────────────────────────────
const PX = 12           // pixels per foot
const SNAP = 0.5        // ft
const MIN_ROOM = 2      // ft minimum room dimension
const SETBACK = 3       // ft pool-deck setback
const EQUIP_GAP = 1.5   // ft gap between equipment items in default layout

// ─── Room colours ─────────────────────────────────────────────────────────────
type CS = { fill: string; stroke: string; text: string }
const ROOM_COLORS: Record<string, CS> = {
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
const ROOM_COLORS_DARK: Record<string, CS> = {
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
const FB_L: CS = { fill: "#f3f4f6", stroke: "#6b7280", text: "#374151" }
const FB_D: CS = { fill: "#141414", stroke: "#374151", text: "#9ca3af" }

const EQUIP_PALETTE = [
  "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
  "#ec4899","#14b8a6","#f97316","#84cc16","#06b6d4",
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const px = (ft: number) => ft * PX
const snap = (v: number) => Math.round(v / SNAP) * SNAP

function isWater(t: string) {
  return t === "Swimming Pool (Water Surface)" ||
         t === "Spa/Hot Tub (Water Surface)" ||
         t === "Cold Plunge (Water Surface)"
}
function isGym(t: string) {
  return t === "Exercise Room (Equipment)" || t === "Exercise Room (Concentrated)"
}
function getDims(item: EquipmentItem) {
  const fw = Math.sqrt(item.footprint)
  const border = item.accessSpace > 0
    ? (Math.sqrt(fw * fw + item.accessSpace) - fw) / 2 : 0
  return { fw, border }
}
function ftArch(ft: number) {
  const w = Math.floor(ft), i = Math.round((ft - w) * 12)
  return i === 0 ? `${w}' - 0"` : `${w}' - ${i}"`
}

// ─── Equipment default layout within gym zone ─────────────────────────────────
type IKey = string
type EPos = { x: number; y: number }
type Positions = Record<IKey, EPos>

function buildEquipDefaults(
  items: EquipmentItem[],
  spaces: SpaceArea[],
  layouts: Record<string, SpaceLayout>
): Positions {
  const gym = spaces.find(s => isGym(s.type))
  const gl = gym ? layouts[gym.id] : null
  let cx = gl ? gl.x + 2 : 4
  let cy = gl ? gl.y + 2 : 100
  const maxX = gl ? gl.x + gl.w - 2 : 120
  let rowH = 0
  const pos: Positions = {}

  for (const item of items) {
    const { fw, border } = getDims(item)
    const slot = fw + 2 * border
    for (let i = 0; i < item.quantity; i++) {
      if (cx + slot > maxX && cx > (gl?.x ?? 4) + 2) {
        cx = gl ? gl.x + 2 : 4
        cy += rowH + EQUIP_GAP
        rowH = 0
      }
      pos[`${item.id}:${i}`] = { x: cx + border, y: cy + border }
      cx += slot + EQUIP_GAP
      rowH = Math.max(rowH, slot)
    }
  }
  return pos
}

function mergeEquipDefaults(
  items: EquipmentItem[],
  spaces: SpaceArea[],
  layouts: Record<string, SpaceLayout>,
  stored?: Positions
): Positions {
  const defaults = buildEquipDefaults(items, spaces, layouts)
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

// ─── Drag state ───────────────────────────────────────────────────────────────
type RoomHandle = "left" | "right" | "top" | "bottom" | "move"
type Drag =
  | { kind: "room";      id: string; handle: RoomHandle; startFt: EPos; startLayout: SpaceLayout }
  | { kind: "enclosure"; handle: RoomHandle; startFt: EPos; startLayout: SpaceLayout }
  | { kind: "equip-zone"; key: IKey; startFt: EPos; startPos: EPos }
  | { kind: "equip-fp";  key: IKey; startFt: EPos; startOff: EPos; border: number }

// ─── Props ────────────────────────────────────────────────────────────────────
interface SpacePlannerProps {
  spaces: SpaceArea[]
  equipment: EquipmentItem[]
  spaceLayouts: Record<string, SpaceLayout>
  enclosure?: SpaceLayout
  storedEquipPositions?: Positions
  isDark: boolean
  onSpaceResize: (id: string, layout: SpaceLayout) => void
  onEnclosureChange: (e: SpaceLayout) => void
  onEquipPositionsChange: (p: Positions) => void
}

// ─── Component ────────────────────────────────────────────────────────────────
export function SpacePlanner({
  spaces, equipment, spaceLayouts, enclosure,
  storedEquipPositions, isDark,
  onSpaceResize, onEnclosureChange, onEquipPositionsChange,
}: SpacePlannerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  // Local mutable copies of layouts and equip positions
  const [localLayouts, setLocalLayouts] = useState(spaceLayouts)
  const [equipPos, setEquipPos] = useState<Positions>(() =>
    mergeEquipDefaults(equipment, spaces, spaceLayouts, storedEquipPositions)
  )
  // Footprint offsets within clearance zone: { dx, dy } from clearance top-left; default = border
  const [fpOffsets, setFpOffsets] = useState<Record<IKey, EPos>>({})
  const [localEnclosure, setLocalEnclosure] = useState(enclosure)

  // Sync when parent loads a saved version
  const prevLayouts = useRef(spaceLayouts)
  if (spaceLayouts !== prevLayouts.current) {
    prevLayouts.current = spaceLayouts
    setLocalLayouts(spaceLayouts)
  }
  const prevEquip = useRef(storedEquipPositions)
  if (storedEquipPositions !== prevEquip.current) {
    prevEquip.current = storedEquipPositions
    setEquipPos(mergeEquipDefaults(equipment, spaces, spaceLayouts, storedEquipPositions))
  }
  const prevEncl = useRef(enclosure)
  if (enclosure !== prevEncl.current) {
    prevEncl.current = enclosure
    setLocalEnclosure(enclosure)
  }

  // Colour helpers
  const palette = isDark ? ROOM_COLORS_DARK : ROOM_COLORS
  const fb = isDark ? FB_D : FB_L
  const gridColor = isDark ? "#131b2e" : "#e5e7eb"
  const bgColor = isDark ? "#080c17" : "#f8fafc"
  const dimColor = isDark ? "#4b5563" : "#9ca3af"
  const occColor = isDark ? "#f59e0b" : "#d97706"

  // Equipment instances
  const instances = useMemo(() =>
    equipment.flatMap((item, idx) => {
      const { fw, border } = getDims(item)
      const totalSF = (item.footprint + item.accessSpace) * item.quantity
        - (item.sharedClearance ?? 0) * Math.max(0, item.quantity - 1)
      return Array.from({ length: item.quantity }, (_, i) => ({
        key: `${item.id}:${i}` as IKey,
        item, fw, border,
        color: EQUIP_PALETTE[idx % EQUIP_PALETTE.length],
        label: item.quantity > 1 ? `${item.name} ${i + 1}` : item.name,
        unitSF: item.footprint + item.accessSpace,
        totalSF,
      }))
    }),
    [equipment]
  )

  // Merged water pairs
  const mergedWaterPairs = useMemo(() => {
    const waterSpaces = spaces.filter(s => isWater(s.type))
    const merged = new Set<string>()
    for (let i = 0; i < waterSpaces.length; i++) {
      for (let j = i + 1; j < waterSpaces.length; j++) {
        const a = localLayouts[waterSpaces[i].id]
        const b = localLayouts[waterSpaces[j].id]
        if (a && b && rectsOverlap(a, b)) {
          merged.add(waterSpaces[i].id)
          merged.add(waterSpaces[j].id)
        }
      }
    }
    return merged
  }, [spaces, localLayouts])

  // Canvas size
  const { svgW, svgH } = useMemo(() => {
    let maxX = 60, maxY = 80
    for (const l of Object.values(localLayouts)) {
      maxX = Math.max(maxX, l.x + l.w + 12)
      maxY = Math.max(maxY, l.y + l.h + 12)
    }
    for (const p of Object.values(equipPos)) {
      maxX = Math.max(maxX, p.x + 12)
      maxY = Math.max(maxY, p.y + 12)
    }
    return { svgW: maxX * PX, svgH: maxY * PX }
  }, [localLayouts, equipPos])

  // ── Pointer ──────────────────────────────────────────────────────────────────
  function toFt(e: React.PointerEvent): EPos {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / PX, y: (e.clientY - r.top) / PX }
  }

  function startRoomDrag(e: React.PointerEvent<SVGElement>, id: string, handle: RoomHandle) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelected(id)
    setDrag({ kind: "room", id, handle, startFt: toFt(e), startLayout: { ...localLayouts[id] } })
  }

  function startEnclosureDrag(e: React.PointerEvent<SVGElement>, handle: RoomHandle) {
    if (!localEnclosure) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ kind: "enclosure", handle, startFt: toFt(e), startLayout: { ...localEnclosure } })
  }

  function startEquipZoneDrag(e: React.PointerEvent<SVGElement>, key: IKey) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ kind: "equip-zone", key, startFt: toFt(e), startPos: { ...equipPos[key] } })
  }

  function startEquipFpDrag(e: React.PointerEvent<SVGElement>, key: IKey, border: number) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const current = fpOffsets[key] ?? { x: border, y: border }
    setDrag({ kind: "equip-fp", key, startFt: toFt(e), startOff: { ...current }, border })
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return
    const ft = toFt(e)
    const dx = snap(ft.x - drag.startFt.x)
    const dy = snap(ft.y - drag.startFt.y)

    if (drag.kind === "room") {
      const { x, y, w, h } = drag.startLayout
      let nl: SpaceLayout
      switch (drag.handle) {
        case "left":   nl = { x: Math.max(0, x + dx), y, w: Math.max(MIN_ROOM, w - dx), h }; break
        case "right":  nl = { x, y, w: Math.max(MIN_ROOM, w + dx), h }; break
        case "top":    nl = { x, y: Math.max(0, y + dy), w, h: Math.max(MIN_ROOM, h - dy) }; break
        case "bottom": nl = { x, y, w, h: Math.max(MIN_ROOM, h + dy) }; break
        default:       nl = { x: Math.max(0, x + dx), y: Math.max(0, y + dy), w, h }
      }
      setLocalLayouts(prev => ({ ...prev, [drag.id]: nl }))
    } else if (drag.kind === "enclosure") {
      const { x, y, w, h } = drag.startLayout
      let nl: SpaceLayout
      switch (drag.handle) {
        case "left":   nl = { x: Math.max(0, x + dx), y, w: Math.max(MIN_ROOM, w - dx), h }; break
        case "right":  nl = { x, y, w: Math.max(MIN_ROOM, w + dx), h }; break
        case "top":    nl = { x, y: Math.max(0, y + dy), w, h: Math.max(MIN_ROOM, h - dy) }; break
        case "bottom": nl = { x, y, w, h: Math.max(MIN_ROOM, h + dy) }; break
        default:       nl = { x: Math.max(0, x + dx), y: Math.max(0, y + dy), w, h }
      }
      setLocalEnclosure(nl)
    } else if (drag.kind === "equip-zone") {
      setEquipPos(prev => ({
        ...prev,
        [drag.key]: {
          x: Math.max(0, drag.startPos.x + dx),
          y: Math.max(0, drag.startPos.y + dy),
        },
      }))
    } else if (drag.kind === "equip-fp") {
      const border = drag.border
      setFpOffsets(prev => ({
        ...prev,
        [drag.key]: {
          x: Math.max(0, Math.min(2 * border, drag.startOff.x + dx)),
          y: Math.max(0, Math.min(2 * border, drag.startOff.y + dy)),
        },
      }))
    }
  }

  function onUp() {
    if (!drag) return
    if (drag.kind === "room") {
      onSpaceResize(drag.id, localLayouts[drag.id])
    } else if (drag.kind === "enclosure") {
      if (localEnclosure) onEnclosureChange(localEnclosure)
    } else if (drag.kind === "equip-zone") {
      onEquipPositionsChange(equipPos)
    }
    setDrag(null)
  }

  function resetEquip() {
    const fresh = buildEquipDefaults(equipment, spaces, spaceLayouts)
    setEquipPos(fresh)
    setFpOffsets({})
    onEquipPositionsChange(fresh)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const HLONG = 26, HSHORT = 8, HRADIUS = 3

  return (
    <div className="relative overflow-auto" style={{ background: bgColor }}>
      {/* Reset button */}
      <button
        onClick={resetEquip}
        className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur hover:bg-muted/60"
      >
        <RotateCcw className="h-3 w-3" /> Reset equipment
      </button>

      <svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        className="block select-none"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onClick={() => setSelected(null)}
      >
        <defs>
          <pattern id="g1" width={PX} height={PX} patternUnits="userSpaceOnUse">
            <path d={`M ${PX} 0 L 0 0 0 ${PX}`} fill="none" stroke={gridColor} strokeWidth="0.4" />
          </pattern>
          <pattern id="g10" width={PX * 10} height={PX * 10} patternUnits="userSpaceOnUse">
            <rect width={PX * 10} height={PX * 10} fill="url(#g1)" />
            <path d={`M ${PX * 10} 0 L 0 0 0 ${PX * 10}`} fill="none" stroke={gridColor} strokeWidth="1" strokeOpacity="0.5" />
          </pattern>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#f59e0b" strokeWidth="3" strokeOpacity="0.35" />
          </pattern>
        </defs>

        <rect width={svgW} height={svgH} fill={bgColor} />
        <rect width={svgW} height={svgH} fill="url(#g10)" />

        {/* ── Enclosure background fill ── */}
        {localEnclosure && (
          <rect
            x={px(localEnclosure.x)} y={px(localEnclosure.y)}
            width={px(localEnclosure.w)} height={px(localEnclosure.h)}
            fill={isDark ? "#0f1623" : "#f0f4f8"} fillOpacity={0.55}
            stroke="none" rx={4} pointerEvents="none"
          />
        )}

        {/* ── Pool deck rings — per-pool expanded rings, masked to true 3' contour ── */}
        {(() => {
          const waterSpaces = spaces.filter(s => isWater(s.type))
          const seen = new Set<string>()
          const groups: SpaceArea[][] = []
          for (const s of waterSpaces) {
            if (seen.has(s.id)) continue
            const group = [s]; seen.add(s.id)
            const la = localLayouts[s.id]
            for (const o of waterSpaces) {
              if (seen.has(o.id)) continue
              const lb = localLayouts[o.id]
              if (la && lb && rectsOverlap(la, lb)) { group.push(o); seen.add(o.id) }
            }
            groups.push(group)
          }
          const deckFill = isDark ? "#271800" : "#fef3c7"
          const deckOpacity = isDark ? 0.92 : 0.9
          const deckStroke = isDark ? "#d97706" : "#d97706"

          return groups.map((group, gi) => {
            const ls = group.map(s => localLayouts[s.id]).filter(Boolean)
            if (!ls.length) return null
            // Bounding box of entire group (for label placement + mask rect)
            const bx0 = Math.min(...ls.map(l => l.x))
            const by0 = Math.min(...ls.map(l => l.y))
            const bx1 = Math.max(...ls.map(l => l.x + l.w))
            const by1 = Math.max(...ls.map(l => l.y + l.h))
            // Canvas coords of the mask coverage area
            const mx = px(bx0 - SETBACK - 0.5), my = px(by0 - SETBACK - 0.5)
            const mw = px(bx1 - bx0 + (SETBACK + 0.5) * 2)
            const mh = px(by1 - by0 + (SETBACK + 0.5) * 2)
            const labelX = px((bx0 + bx1) / 2), labelY = px(by0 - SETBACK) - 3
            const maskId = `dm-${gi}`

            return (
              <g key={`deck-grp-${gi}`} pointerEvents="none">
                <defs>
                  <mask id={maskId}>
                    {/* White = show amber: one expanded rect per pool */}
                    {ls.map((l, li) => (
                      <rect key={`exp-${li}`}
                        x={px(l.x - SETBACK)} y={px(l.y - SETBACK)}
                        width={px(l.w + SETBACK * 2)} height={px(l.h + SETBACK * 2)}
                        fill="white" />
                    ))}
                    {/* Black = cut out: the actual water bodies */}
                    {ls.map((l, li) => (
                      <rect key={`cut-${li}`}
                        x={px(l.x)} y={px(l.y)}
                        width={px(l.w)} height={px(l.h)}
                        fill="black" />
                    ))}
                  </mask>
                </defs>

                {/* Amber fill — shaped to true 3' margin via mask */}
                <rect x={mx} y={my} width={mw} height={mh}
                  fill={deckFill} fillOpacity={deckOpacity}
                  mask={`url(#${maskId})`} />

                {/* Amber outline around each pool's expanded rect (behind pool bodies) */}
                {ls.map((l, li) => (
                  <rect key={`str-${li}`}
                    x={px(l.x - SETBACK)} y={px(l.y - SETBACK)}
                    width={px(l.w + SETBACK * 2)} height={px(l.h + SETBACK * 2)}
                    fill="none" stroke={deckStroke} strokeWidth={1.5} rx={3} />
                ))}

                <text x={labelX} y={labelY}
                  textAnchor="middle" fontSize={7.5}
                  fill={isDark ? "#fbbf24" : "#92400e"}
                  fontFamily="'Geist Mono',monospace">
                  3&apos; min deck
                </text>
              </g>
            )
          })
        })()}

        {/* ── ROOMS ── */}
        {spaces.map(space => {
          const layout = localLayouts[space.id]
          if (!layout) return null
          const colors = palette[space.type] ?? fb
          const rx = px(layout.x), ry = px(layout.y)
          const rw = px(layout.w), rh = px(layout.h)
          const cx2 = rx + rw / 2, cy2 = ry + rh / 2
          const isSel = selected === space.id
          const sf = Math.round(layout.w * layout.h)
          const occ = Math.ceil(sf / IBC_LOAD_FACTORS[space.type])
          const isWaterSpace = isWater(space.type)
          const isMerged = mergedWaterPairs.has(space.id)

          const hFill = isDark ? "#1e293b" : "#fff"

          return (
            <g key={space.id}>
              {/* Room body */}
              <rect
                x={rx} y={ry} width={rw} height={rh}
                fill={colors.fill}
                stroke={isMerged ? colors.stroke : colors.stroke}
                strokeWidth={isSel ? 2.5 : isMerged ? 2 : 1.5}
                strokeDasharray={space.isConditioned ? undefined : "6 3"}
                rx={3}
                style={{ cursor: "grab" }}
                onPointerDown={e => startRoomDrag(e, space.id, "move")}
              />

              {/* Merged water glow */}
              {isMerged && (
                <rect
                  x={rx} y={ry} width={rw} height={rh}
                  fill={colors.stroke} fillOpacity={0.12}
                  rx={3} pointerEvents="none"
                />
              )}

              {/* Conditioned accent bar */}
              {space.isConditioned && (
                <rect x={rx + 3} y={ry} width={rw - 6} height={3}
                  fill={colors.stroke} fillOpacity={0.45} rx={1.5} pointerEvents="none" />
              )}

              {/* Labels */}
              {rw > 28 && rh > 20 && (
                <g pointerEvents="none">
                  <text x={cx2} y={ry + Math.min(20, rh * 0.2)}
                    textAnchor="middle"
                    fontSize={Math.min(12, Math.max(8, rw / 9))}
                    fill={colors.text} fontWeight="700" fontFamily="system-ui,sans-serif">
                    {rw > 80 ? space.name : space.name.split(" ")[0]}
                  </text>
                  {rh > 44 && rw > 40 && (
                    <text x={cx2} y={ry + Math.min(34, rh * 0.32)}
                      textAnchor="middle"
                      fontSize={Math.min(10, Math.max(7, rw / 14))}
                      fill={colors.text} opacity={0.6} fontFamily="'Geist Mono',monospace">
                      {sf.toLocaleString()} SF
                    </text>
                  )}
                  <text x={cx2} y={ry + rh - 14}
                    textAnchor="middle"
                    fontSize={Math.min(16, Math.max(9, rw / 5.5))}
                    fill={occColor} fontWeight="800" fontFamily="'Geist Mono',monospace">
                    {occ}
                  </text>
                  {rw > 36 && (
                    <text x={cx2} y={ry + rh - 4}
                      textAnchor="middle" fontSize={6.5}
                      fill={colors.text} opacity={0.4} fontFamily="'Geist Mono',monospace">
                      OCC
                    </text>
                  )}
                </g>
              )}

              {/* Dimension callouts when selected */}
              {isSel && (
                <g pointerEvents="none" fontSize={9} fontFamily="'Geist Mono',monospace" fill={dimColor}>
                  <line x1={rx} y1={ry + rh + 13} x2={rx + rw} y2={ry + rh + 13} stroke={dimColor} strokeWidth={0.7} />
                  <line x1={rx} y1={ry + rh + 9} x2={rx} y2={ry + rh + 17} stroke={dimColor} strokeWidth={0.7} />
                  <line x1={rx + rw} y1={ry + rh + 9} x2={rx + rw} y2={ry + rh + 17} stroke={dimColor} strokeWidth={0.7} />
                  <text x={cx2} y={ry + rh + 24} textAnchor="middle">{ftArch(layout.w)}</text>
                  <line x1={rx + rw + 13} y1={ry} x2={rx + rw + 13} y2={ry + rh} stroke={dimColor} strokeWidth={0.7} />
                  <line x1={rx + rw + 9} y1={ry} x2={rx + rw + 17} y2={ry} stroke={dimColor} strokeWidth={0.7} />
                  <line x1={rx + rw + 9} y1={ry + rh} x2={rx + rw + 17} y2={ry + rh} stroke={dimColor} strokeWidth={0.7} />
                  <text x={rx + rw + 25} y={cy2 + 3} textAnchor="middle"
                    transform={`rotate(-90 ${rx + rw + 25} ${cy2})`}>{ftArch(layout.h)}
                  </text>
                </g>
              )}

              {/* Resize handles */}
              {(["left","right","top","bottom"] as RoomHandle[]).map(side => {
                const hx = side === "left" ? rx - HSHORT / 2
                  : side === "right" ? rx + rw - HSHORT / 2
                  : cx2 - HLONG / 2
                const hy = side === "top" ? ry - HSHORT / 2
                  : side === "bottom" ? ry + rh - HSHORT / 2
                  : cy2 - HLONG / 2
                const hw = (side === "top" || side === "bottom") ? HLONG : HSHORT
                const hh = (side === "left" || side === "right") ? HLONG : HSHORT
                const cursor = (side === "left" || side === "right") ? "ew-resize" : "ns-resize"
                return (
                  <rect key={side}
                    x={hx} y={hy} width={hw} height={hh}
                    fill={hFill} stroke={colors.stroke} strokeWidth={1.5} rx={HRADIUS}
                    style={{ cursor }}
                    className={isSel ? "opacity-100" : "opacity-0 hover:opacity-100"}
                    onPointerDown={e => startRoomDrag(e, space.id, side)}
                  />
                )
              })}
            </g>
          )
        })}

        {/* ── EQUIPMENT (on top of rooms) ── */}
        {instances.map(({ key, item, fw, border, color, label, unitSF }) => {
          const pos = equipPos[key]
          if (!pos) return null
          const fpOff = fpOffsets[key] ?? { x: border, y: border }
          const clearX = px(pos.x - border), clearY = px(pos.y - border)
          const clearS = px(fw + 2 * border)
          const fpX = px(pos.x - border + fpOff.x)
          const fpY = px(pos.y - border + fpOff.y)
          const fpS = px(fw)
          const isDraggingZone = drag?.kind === "equip-zone" && drag.key === key
          const isDraggingFp = drag?.kind === "equip-fp" && drag.key === key
          const fSize = Math.max(7, Math.min(11, fpS / 3.5))

          return (
            <g key={key}>
              {/* Clearance zone — drag to move whole unit */}
              <rect
                x={clearX} y={clearY} width={clearS} height={clearS}
                fill={color} fillOpacity={isDraggingZone ? 0.12 : 0.06}
                stroke={color} strokeWidth={1} strokeDasharray="5 3" rx={3}
                style={{ cursor: isDraggingZone ? "grabbing" : "grab" }}
                onPointerDown={e => startEquipZoneDrag(e, key)}
              />
              {/* Footprint — drag within clearance zone */}
              <rect
                x={fpX} y={fpY} width={fpS} height={fpS}
                fill={color} fillOpacity={isDraggingFp ? 0.55 : 0.22}
                stroke={color} strokeWidth={1.5} rx={2}
                style={{ cursor: isDraggingFp ? "grabbing" : "crosshair" }}
                onPointerDown={e => startEquipFpDrag(e, key, border)}
              />
              {/* Labels on footprint */}
              <g pointerEvents="none">
                <text x={fpX + fpS / 2} y={fpY + fpS / 2 - fSize * 0.5}
                  textAnchor="middle" fontSize={fSize}
                  fill={color} fontWeight="600" fontFamily="system-ui,sans-serif">
                  {label}
                </text>
                <text x={fpX + fpS / 2} y={fpY + fpS / 2 + fSize * 0.9}
                  textAnchor="middle" fontSize={Math.max(6, fSize - 2)}
                  fill={color} opacity={0.75} fontFamily="'Geist Mono',monospace">
                  {unitSF} SF
                </text>
              </g>
            </g>
          )
        })}

        {/* ── Enclosure boundary (on top so handles are reachable) ── */}
        {localEnclosure && (() => {
          const { x, y, w, h } = localEnclosure
          const ex = px(x), ey = px(y), ew = px(w), eh = px(h)
          const ecx = ex + ew / 2
          const ecy = ey + eh / 2
          const encStroke = isDark ? "#94a3b8" : "#475569"
          const hFill = isDark ? "#1e293b" : "#fff"
          return (
            <g key="enclosure">
              <rect
                x={ex} y={ey} width={ew} height={eh}
                fill="none"
                stroke={encStroke} strokeWidth={2.5} strokeDasharray="10 6"
                rx={4}
                style={{ cursor: "grab" }}
                onPointerDown={e => startEnclosureDrag(e, "move")}
              />
              <text x={ecx} y={ey + 14}
                textAnchor="middle" fontSize={9}
                fill={encStroke} fontFamily="'Geist Mono',monospace" fontWeight="600"
                pointerEvents="none" letterSpacing={1}>
                FACILITY BOUNDARY
              </text>
              {(["left","right","top","bottom"] as RoomHandle[]).map(side => {
                const hx = side === "left" ? ex - 4
                  : side === "right" ? ex + ew - 4
                  : ecx - 13
                const hy = side === "top" ? ey - 4
                  : side === "bottom" ? ey + eh - 4
                : ecy - 13
                const hw = (side === "top" || side === "bottom") ? 26 : 8
                const hh = (side === "left" || side === "right") ? 26 : 8
                const cur = (side === "left" || side === "right") ? "ew-resize" : "ns-resize"
                return (
                  <rect key={side}
                    x={hx} y={hy} width={hw} height={hh}
                    fill={hFill} stroke={encStroke} strokeWidth={1.5} rx={3}
                    style={{ cursor: cur }}
                    onPointerDown={e => startEnclosureDrag(e, side)}
                  />
                )
              })}

              {/* Dimension callouts — always visible on enclosure */}
              <g pointerEvents="none" fontSize={9} fontFamily="'Geist Mono',monospace" fill={encStroke}>
                {/* Width — bottom */}
                <line x1={ex} y1={ey + eh + 16} x2={ex + ew} y2={ey + eh + 16} stroke={encStroke} strokeWidth={0.8} />
                <line x1={ex} y1={ey + eh + 11} x2={ex} y2={ey + eh + 21} stroke={encStroke} strokeWidth={0.8} />
                <line x1={ex + ew} y1={ey + eh + 11} x2={ex + ew} y2={ey + eh + 21} stroke={encStroke} strokeWidth={0.8} />
                <text x={ecx} y={ey + eh + 28} textAnchor="middle" fontWeight="600">{ftArch(localEnclosure!.w)}</text>
                {/* Height — right */}
                <line x1={ex + ew + 16} y1={ey} x2={ex + ew + 16} y2={ey + eh} stroke={encStroke} strokeWidth={0.8} />
                <line x1={ex + ew + 11} y1={ey} x2={ex + ew + 21} y2={ey} stroke={encStroke} strokeWidth={0.8} />
                <line x1={ex + ew + 11} y1={ey + eh} x2={ex + ew + 21} y2={ey + eh} stroke={encStroke} strokeWidth={0.8} />
                <text x={ex + ew + 28} y={ecy + 3} textAnchor="middle" fontWeight="600"
                  transform={`rotate(-90 ${ex + ew + 28} ${ecy})`}>{ftArch(localEnclosure!.h)}
                </text>
              </g>
            </g>
          )
        })()}

        {/* Scale bar */}
        <g transform={`translate(12, ${svgH - 22})`} pointerEvents="none">
          <rect x={0} y={0} width={px(10)} height={4} fill={dimColor} fillOpacity={0.4} />
          <rect x={0} y={0} width={px(5)} height={4} fill={dimColor} fillOpacity={0.7} />
          <text x={0} y={13} fontSize={7} fill={dimColor} fontFamily="'Geist Mono',monospace">0</text>
          <text x={px(5) - 4} y={13} fontSize={7} fill={dimColor} fontFamily="'Geist Mono',monospace">5'</text>
          <text x={px(10) - 4} y={13} fontSize={7} fill={dimColor} fontFamily="'Geist Mono',monospace">10'</text>
        </g>
      </svg>
    </div>
  )
}
