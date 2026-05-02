"use client"

import React, { useRef, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { RotateCcw } from "lucide-react"
import { IBC_LOAD_FACTORS, isNonRoomType, isWaterType, isGymType, isAreaType, rectsOverlap, rectsTouch } from "@/lib/types"
import type { EquipmentItem, SpaceArea, SpaceLayout } from "@/lib/types"

// ─── Scale & constants ────────────────────────────────────────────────────────
const PX = 12           // pixels per foot
const SNAP = 0.5        // ft
const MIN_ROOM = 2      // ft minimum room dimension
const SETBACK = 3       // ft pool-deck setback
const EQUIP_GAP = 1.5   // ft gap between equipment items in default layout

// ─── Room colours ─────────────────────────────────────────────────────────────
// Color families map to occupancy/use category:
//   Water surfaces (all 50 SF/p) → blue
//   Exercise → green   Thermal → red   Deck/lounge → amber/orange
//   Support (restroom, locker, storage, circulation) → neutral slate
type CS = { fill: string; stroke: string; text: string }
const ROOM_COLORS: Record<string, CS> = {
  // Water — blue family (same calc method)
  "Swimming Pool (Water Surface)":  { fill: "#dbeafe", stroke: "#2563eb", text: "#1e40af" },
  "Spa/Hot Tub (Water Surface)":    { fill: "#dbeafe", stroke: "#1d4ed8", text: "#1e3a8a" },
  "Cold Plunge (Water Surface)":    { fill: "#e0f9ff", stroke: "#0284c7", text: "#0c4a6e" },
  // Deck
  "Pool Deck":                      { fill: "#fef3c7", stroke: "#d97706", text: "#92400e" },
  // Exercise
  "Exercise Room (Equipment)":      { fill: "#dcfce7", stroke: "#16a34a", text: "#15803d" },
  "Exercise Room (Concentrated)":   { fill: "#d1fae5", stroke: "#059669", text: "#065f46" },
  // Thermal
  "Sauna/Steam Room":               { fill: "#fee2e2", stroke: "#dc2626", text: "#991b1b" },
  // Support — neutral slate (no direct occupancy category)
  "Locker Room":                    { fill: "#f1f5f9", stroke: "#64748b", text: "#374151" },
  "Lobby/Reception":                { fill: "#f0fdf4", stroke: "#15803d", text: "#14532d" },
  "Restroom":                       { fill: "#f1f5f9", stroke: "#64748b", text: "#374151" },
  "Circulation":                    { fill: "#f3f4f6", stroke: "#6b7280", text: "#374151" },
  "Lounge/Seating Area":            { fill: "#fff7ed", stroke: "#c2410c", text: "#7c2d12" },
  "Storage":                        { fill: "#f9fafb", stroke: "#9ca3af", text: "#6b7280" },
  "Mechanical":                     { fill: "#f9fafb", stroke: "#9ca3af", text: "#6b7280" },
  "Office":                         { fill: "#fffbeb", stroke: "#b45309", text: "#78350f" },
}
const ROOM_COLORS_DARK: Record<string, CS> = {
  // Water — blue family
  "Swimming Pool (Water Surface)":  { fill: "#0b1e3d", stroke: "#3b82f6", text: "#93c5fd" },
  "Spa/Hot Tub (Water Surface)":    { fill: "#0c1f3a", stroke: "#60a5fa", text: "#bfdbfe" },
  "Cold Plunge (Water Surface)":    { fill: "#051a2e", stroke: "#38bdf8", text: "#7dd3fc" },
  // Deck
  "Pool Deck":                      { fill: "#271800", stroke: "#d97706", text: "#fbbf24" },
  // Exercise
  "Exercise Room (Equipment)":      { fill: "#0a1e0e", stroke: "#16a34a", text: "#86efac" },
  "Exercise Room (Concentrated)":   { fill: "#0a1e11", stroke: "#059669", text: "#6ee7b7" },
  // Thermal
  "Sauna/Steam Room":               { fill: "#280a0a", stroke: "#dc2626", text: "#fca5a5" },
  // Support — neutral slate
  "Locker Room":                    { fill: "#111827", stroke: "#475569", text: "#94a3b8" },
  "Lobby/Reception":                { fill: "#091a0e", stroke: "#15803d", text: "#86efac" },
  "Restroom":                       { fill: "#111827", stroke: "#475569", text: "#94a3b8" },
  "Circulation":                    { fill: "#141414", stroke: "#4b5563", text: "#9ca3af" },
  "Lounge/Seating Area":            { fill: "#271200", stroke: "#c2410c", text: "#fb923c" },
  "Storage":                        { fill: "#101010", stroke: "#374151", text: "#6b7280" },
  "Mechanical":                     { fill: "#101010", stroke: "#374151", text: "#6b7280" },
  "Office":                         { fill: "#1a1300", stroke: "#b45309", text: "#fbbf24" },
}
const FB_L: CS = { fill: "#f3f4f6", stroke: "#6b7280", text: "#374151" }
const FB_D: CS = { fill: "#1e293b", stroke: "#475569", text: "#94a3b8" }

// Equipment palette — neutral slate: equipment is layout/SF, not an occupancy category
const EQUIP_PALETTE = [
  "#64748b","#78716c","#6b7280","#52525b","#57534e",
  "#475569","#71717a","#4b5563","#737373","#9ca3af",
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const px = (ft: number) => ft * PX
const snap = (v: number) => Math.round(v / SNAP) * SNAP

// isWaterType, isGymType, isAreaType, rectsTouch imported from @/lib/types
function getDims(item: EquipmentItem) {
  const fw = Math.sqrt(item.footprint)
  const border = item.accessSpace > 0
    ? (Math.sqrt(fw * fw + item.accessSpace) - fw) / 2 : 0
  return { fw, border }
}
function getEquipDims(item: EquipmentItem, stored?: EquipSize): EquipSize & { borderX: number; borderY: number } {
  if (stored) {
    return { ...stored, borderX: (stored.clearW - stored.w) / 2, borderY: (stored.clearH - stored.h) / 2 }
  }
  const fw = Math.sqrt(item.footprint)
  const border = item.accessSpace > 0 ? (Math.sqrt(fw * fw + item.accessSpace) - fw) / 2 : 0
  return { w: fw, h: fw, clearW: fw + 2 * border, clearH: fw + 2 * border, borderX: border, borderY: border }
}
function ftArch(ft: number) {
  const w = Math.floor(ft), i = Math.round((ft - w) * 12)
  return i === 0 ? `${w}' - 0"` : `${w}' - ${i}"`
}
function rectUnionAreaFt(rects: {x:number,y:number,w:number,h:number}[]): number {
  let a = rects.reduce((s,r) => s + r.w*r.h, 0)
  for (let i=0; i<rects.length; i++) for (let j=i+1; j<rects.length; j++) {
    const p=rects[i], q=rects[j]
    a -= Math.max(0, Math.min(p.x+p.w,q.x+q.w)-Math.max(p.x,q.x)) *
         Math.max(0, Math.min(p.y+p.h,q.y+q.h)-Math.max(p.y,q.y))
  }
  return a
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
  const gym = spaces.find(s => isGymType(s.type))
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

// ─── Equipment size (non-square) ──────────────────────────────────────────────
type EquipSize = { w: number; h: number; clearW: number; clearH: number }
type HandleOverlay = {
  key: string; x: number; y: number; w: number; h: number
  fill: string; stroke: string; sw: number; cursor: string
  onPointerDown?: (e: React.PointerEvent<SVGRectElement>) => void
  followXBounds?: [number, number]  // cursor x clamped to this range; handle x = clamp - w/2
  followYBounds?: [number, number]  // cursor y clamped to this range; handle y = clamp - h/2
}

// ─── Drag state ───────────────────────────────────────────────────────────────
type RoomHandle = "left" | "right" | "top" | "bottom" | "move"
type Drag =
  | { kind: "room";             id: string; handle: RoomHandle; startFt: EPos; startLayout: SpaceLayout }
  | { kind: "enclosure";        handle: RoomHandle; startFt: EPos; startLayout: SpaceLayout }
  | { kind: "equip-zone";       key: IKey; startFt: EPos; startPos: EPos }
  | { kind: "equip-fp";         key: IKey; startFt: EPos; startOff: EPos; borderX: number; borderY: number }
  | { kind: "equip-resize-fp";  key: IKey; itemId: string; handle: "right"|"bottom"; startFt: EPos; startW: number; startH: number }
  | { kind: "equip-resize-zone"; key: IKey; itemId: string; handle: "right"|"bottom"; startFt: EPos; startClearW: number; startClearH: number; fpW: number; fpH: number }

// ─── Props ────────────────────────────────────────────────────────────────────
interface SpacePlannerProps {
  spaces: SpaceArea[]
  equipment: EquipmentItem[]
  spaceLayouts: Record<string, SpaceLayout>
  enclosure?: SpaceLayout
  storedEquipPositions?: Positions
  storedEquipSizes?: Record<string, EquipSize>
  isDark: boolean
  onSpaceResize: (id: string, layout: SpaceLayout) => void
  onEnclosureChange: (e: SpaceLayout) => void
  onEquipPositionsChange: (p: Positions) => void
  onEquipResize?: (id: string, updates: Partial<EquipmentItem>) => void
  onEquipSizeChange?: (id: string, size: EquipSize) => void
  onDuplicate?: (spaceId: string) => void
  onDeleteSpace?: (spaceId: string) => void
  onRenameSpace?: (spaceId: string, name: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────
export function SpacePlanner({
  spaces, equipment, spaceLayouts, enclosure,
  storedEquipPositions, storedEquipSizes, isDark,
  onSpaceResize, onEnclosureChange, onEquipPositionsChange,
  onEquipResize, onEquipSizeChange, onDuplicate, onDeleteSpace, onRenameSpace,
}: SpacePlannerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Selection state captured at pointerdown — lets onClick know if element was already selected
  const preDownSelRef = useRef<{ room: string|null; equip: string|null; enclosure: boolean }>({ room: null, equip: null, enclosure: false })
  const [drag, setDrag] = useState<Drag | null>(null)
  const [selected, setSelected] = useState<string | null>(null)           // room ID
  const [selectedEquip, setSelectedEquip] = useState<string | null>(null) // IKey
  const [selectedEnclosure, setSelectedEnclosure] = useState(false)
  const [editingNameId, setEditingNameId] = useState<string | null>(null) // in-situ rename

  // Local mutable copies of layouts and equip positions
  const [localLayouts, setLocalLayouts] = useState(spaceLayouts)
  const [equipPos, setEquipPos] = useState<Positions>(() =>
    mergeEquipDefaults(equipment, spaces, spaceLayouts, storedEquipPositions)
  )
  // Footprint offsets within clearance zone: { dx, dy } from clearance top-left; default = border
  const [fpOffsets, setFpOffsets] = useState<Record<IKey, EPos>>({})
  const [localEnclosure, setLocalEnclosure] = useState(enclosure)
  // Equipment sizes: keyed by item.id, stores independent W/H for non-square support
  const [equipSizes, setEquipSizes] = useState<Record<string, EquipSize>>(storedEquipSizes ?? {})
  // Handle overlay: the hovered handle is re-rendered on top so overlapping handles remain accessible
  const [handleOverlay, setHandleOverlay] = useState<HandleOverlay | null>(null)
  // Cursor position in SVG pixels — used to slide handles along their edge toward the cursor
  const [cursorPx, setCursorPx] = useState<{x: number; y: number} | null>(null)

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
  const prevEquipSizes = useRef(storedEquipSizes)
  if (storedEquipSizes !== prevEquipSizes.current) {
    prevEquipSizes.current = storedEquipSizes
    setEquipSizes(storedEquipSizes ?? {})
  }

  // Colour helpers
  const palette = isDark ? ROOM_COLORS_DARK : ROOM_COLORS
  const fb = isDark ? FB_D : FB_L
  const gridColor = isDark ? "#2a261f" : "#e7e2d3"
  const bgColor = isDark ? "#1a1814" : "#f4efe2"
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

  // Overlapping water groups (connected components via BFS)
  const waterGroups = useMemo(() => {
    const waterSpaces = spaces.filter(s => isWaterType(s.type))
    const seen = new Set<string>()
    const groups: SpaceArea[][] = []
    for (const s of waterSpaces) {
      if (seen.has(s.id)) continue
      const la = localLayouts[s.id]
      if (!la) { seen.add(s.id); continue }
      const group = [s]; seen.add(s.id)
      let qi = 0
      while (qi < group.length) {
        const lc = localLayouts[group[qi++].id]
        if (!lc) continue
        for (const other of waterSpaces) {
          if (seen.has(other.id)) continue
          const lo = localLayouts[other.id]
          if (lo && rectsTouch(lc, lo)) { group.push(other); seen.add(other.id) }
        }
      }
      if (group.length > 1) groups.push(group)
    }
    return groups
  }, [spaces, localLayouts])

  const mergedWaterIds = useMemo(() => {
    const ids = new Set<string>()
    for (const g of waterGroups) for (const s of g) ids.add(s.id)
    return ids
  }, [waterGroups])

  // Adjacent/overlapping compound groups (BFS, touch predicate).
  // - Area types: merge by type only (water cross-merges via waterGroups separately)
  // - Enclosed rooms: merge by type + name (compound non-rect rooms; same-name only)
  // Groups with 1 member are excluded (no merging needed, no overlay rendered).
  const areaTypeGroups = useMemo(() => {
    const byKey: Record<string, SpaceArea[]> = {}
    for (const s of spaces) {
      if (isWaterType(s.type)) continue           // water handled by waterGroups
      const key = isAreaType(s.type)
        ? `area\0${s.type}`
        : `room\0${s.type}\0${s.name}`            // rooms: same type + same name
      if (!byKey[key]) byKey[key] = []
      byKey[key].push(s)
    }
    const groups: SpaceArea[][] = []
    for (const bucket of Object.values(byKey)) {
      const seen = new Set<string>()
      for (const s of bucket) {
        if (seen.has(s.id)) continue
        const la = localLayouts[s.id]
        if (!la) { seen.add(s.id); continue }
        const group = [s]; seen.add(s.id)
        let qi = 0
        while (qi < group.length) {
          const lc = localLayouts[group[qi++].id]
          if (!lc) continue
          for (const other of bucket) {
            if (seen.has(other.id)) continue
            const lo = localLayouts[other.id]
            if (lo && rectsTouch(lc, lo)) { group.push(other); seen.add(other.id) }
          }
        }
        if (group.length > 1) groups.push(group)
      }
    }
    return groups
  }, [spaces, localLayouts])

  const mergedAreaIds = useMemo(() => {
    const ids = new Set<string>()
    for (const g of areaTypeGroups) for (const s of g) ids.add(s.id)
    return ids
  }, [areaTypeGroups])

  // 4 non-overlapping strips that tile the 3ft ring around every water surface.
  // Top/bottom include the corners; left/right are side-only (no corner duplication).
  const autoDeckStripLayouts = useMemo(() => {
    const strips: {x:number,y:number,w:number,h:number}[] = []
    for (const s of spaces) {
      if (!isWaterType(s.type)) continue
      const l = localLayouts[s.id]
      if (!l) continue
      strips.push(
        { x: l.x-SETBACK, y: l.y-SETBACK, w: l.w+SETBACK*2, h: SETBACK },
        { x: l.x-SETBACK, y: l.y+l.h,     w: l.w+SETBACK*2, h: SETBACK },
        { x: l.x-SETBACK, y: l.y,          w: SETBACK,        h: l.h    },
        { x: l.x+l.w,     y: l.y,          w: SETBACK,        h: l.h    },
      )
    }
    return strips
  }, [spaces, localLayouts])

  // Canvas size — always large enough to show the enclosure boundary
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
    if (localEnclosure) {
      maxX = Math.max(maxX, localEnclosure.x + localEnclosure.w + 12)
      maxY = Math.max(maxY, localEnclosure.y + localEnclosure.h + 4)
    }
    return { svgW: maxX * PX, svgH: maxY * PX }
  }, [localLayouts, equipPos, localEnclosure])

  // ── Selection helpers (mutual exclusion) ─────────────────────────────────────
  function selectRoom(id: string)  { setSelected(id);   setSelectedEquip(null); setSelectedEnclosure(false) }
  function selectEquip(key: IKey)  { setSelected(null); setSelectedEquip(key);  setSelectedEnclosure(false) }
  function selectEnclosure()       { setSelected(null); setSelectedEquip(null); setSelectedEnclosure(true)  }
  function clearSelection()        { setSelected(null); setSelectedEquip(null); setSelectedEnclosure(false) }

  // ── Pointer ──────────────────────────────────────────────────────────────────
  function toFt(e: React.PointerEvent): EPos {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / PX, y: (e.clientY - r.top) / PX }
  }

  function startRoomDrag(e: React.PointerEvent<SVGElement>, id: string, handle: RoomHandle) {
    // Capture pre-down selection only for body moves; resize handles shouldn't trigger deselect on tap
    preDownSelRef.current = handle === "move"
      ? { room: selected, equip: selectedEquip, enclosure: selectedEnclosure }
      : { room: null, equip: null, enclosure: false }
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    if (handle === "move") setHandleOverlay(null)
    selectRoom(id)
    setDrag({ kind: "room", id, handle, startFt: toFt(e), startLayout: { ...localLayouts[id] } })
  }

  function startEnclosureDrag(e: React.PointerEvent<SVGElement>, handle: RoomHandle) {
    if (!localEnclosure) return
    preDownSelRef.current = handle === "move"
      ? { room: selected, equip: selectedEquip, enclosure: selectedEnclosure }
      : { room: null, equip: null, enclosure: false }
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    if (handle === "move") setHandleOverlay(null)
    selectEnclosure()
    setDrag({ kind: "enclosure", handle, startFt: toFt(e), startLayout: { ...localEnclosure } })
  }

  function startEquipZoneDrag(e: React.PointerEvent<SVGElement>, key: IKey) {
    preDownSelRef.current = { room: selected, equip: selectedEquip, enclosure: selectedEnclosure }
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    selectEquip(key)
    setDrag({ kind: "equip-zone", key, startFt: toFt(e), startPos: { ...equipPos[key] } })
  }

  function startEquipFpDrag(e: React.PointerEvent<SVGElement>, key: IKey, borderX: number, borderY: number) {
    preDownSelRef.current = { room: selected, equip: selectedEquip, enclosure: selectedEnclosure }
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    selectEquip(key)
    const current = fpOffsets[key] ?? { x: borderX, y: borderY }
    setDrag({ kind: "equip-fp", key, startFt: toFt(e), startOff: { ...current }, borderX, borderY })
  }

  function startEquipResizeFp(e: React.PointerEvent<SVGElement>, key: IKey, itemId: string, handle: "right"|"bottom", startW: number, startH: number) {
    preDownSelRef.current = { room: null, equip: null, enclosure: false }
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ kind: "equip-resize-fp", key, itemId, handle, startFt: toFt(e), startW, startH })
  }

  function startEquipResizeZone(e: React.PointerEvent<SVGElement>, key: IKey, itemId: string, handle: "right"|"bottom", startClearW: number, startClearH: number, fpW: number, fpH: number) {
    preDownSelRef.current = { room: null, equip: null, enclosure: false }
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ kind: "equip-resize-zone", key, itemId, handle, startFt: toFt(e), startClearW, startClearH, fpW, fpH })
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (selected || selectedEquip || selectedEnclosure || drag) {
      const r = svgRef.current!.getBoundingClientRect()
      setCursorPx({ x: e.clientX - r.left, y: e.clientY - r.top })
    }
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
      const { borderX, borderY } = drag
      setFpOffsets(prev => ({
        ...prev,
        [drag.key]: {
          x: Math.max(0, Math.min(2 * borderX, drag.startOff.x + dx)),
          y: Math.max(0, Math.min(2 * borderY, drag.startOff.y + dy)),
        },
      }))
    } else if (drag.kind === "equip-resize-fp") {
      const { handle, startW, startH, itemId } = drag
      const area = startW * startH
      let newW: number, newH: number
      if (handle === "right") {
        newW = Math.max(0.5, startW + dx)
        newH = area / newW
      } else {
        newH = Math.max(0.5, startH + dy)
        newW = area / newH
      }
      const current = equipSizes[itemId] ?? getEquipDims(equipment.find(e => e.id === itemId) ?? { footprint: area, accessSpace: 0, id: itemId, name: "", quantity: 1 })
      const borderX = (current.clearW - current.w) / 2
      const borderY = (current.clearH - current.h) / 2
      const newSize: EquipSize = { w: newW, h: newH, clearW: newW + 2 * borderX, clearH: newH + 2 * borderY }
      setEquipSizes(prev => ({ ...prev, [itemId]: newSize }))
      onEquipResize?.(itemId, { footprint: Math.round(newW * newH) })
    } else if (drag.kind === "equip-resize-zone") {
      const { handle, startClearW, startClearH, fpW, fpH, itemId } = drag
      const clearArea = startClearW * startClearH
      let newClearW: number, newClearH: number
      if (handle === "right") {
        newClearW = Math.max(fpW, startClearW + dx)
        newClearH = Math.max(fpH, clearArea / newClearW)
      } else {
        newClearH = Math.max(fpH, startClearH + dy)
        newClearW = Math.max(fpW, clearArea / newClearH)
      }
      const newSize: EquipSize = { w: fpW, h: fpH, clearW: newClearW, clearH: newClearH }
      setEquipSizes(prev => ({ ...prev, [itemId]: newSize }))
      onEquipResize?.(itemId, { accessSpace: Math.max(0, Math.round(newClearW * newClearH - fpW * fpH)) })
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
    } else if (drag.kind === "equip-resize-fp" || drag.kind === "equip-resize-zone") {
      const size = equipSizes[drag.itemId]
      if (size) onEquipSizeChange?.(drag.itemId, size)
    }
    setDrag(null)
    setHandleOverlay(null)
  }

  function resetEquip() {
    const fresh = buildEquipDefaults(equipment, spaces, spaceLayouts)
    setEquipPos(fresh)
    setFpOffsets({})
    onEquipPositionsChange(fresh)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const HLONG = 26, HSHORT = 8, HSHORT_HIT = 14, HRADIUS = 3
  const INNER_INSET = 4  // px — inner border ring inset for double-line room rendering

  return (
    <div className="relative overflow-auto" style={{ background: bgColor }}>
      {/* Reset button */}
      <button
        onClick={resetEquip}
        className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-border bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur hover:bg-muted/60"
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
        onPointerLeave={e => { onUp(); setCursorPx(null) }}
        onClick={clearSelection}
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

        {/* ── Enclosure background fill — Circulation baseline at z=0 ── */}
        {localEnclosure && (
          <rect
            x={px(localEnclosure.x)} y={px(localEnclosure.y)}
            width={px(localEnclosure.w)} height={px(localEnclosure.h)}
            fill={isDark ? "#141414" : "#f3f4f6"} fillOpacity={0.7}
            stroke="none" rx={4} pointerEvents="none"
          />
        )}

        {/* ── Auto-deck strips — 3ft ring tiled as 4 plain rects per water surface ── */}
        {autoDeckStripLayouts.length > 0 && (() => {
          const hasManualPoolDeck = spaces.some(s => s.type === "Pool Deck")
          const colors = palette["Pool Deck"] ?? fb
          // Label only when no manual deck — otherwise areaTypeGroups overlay handles it
          let labelEl: React.ReactNode = null
          if (!hasManualPoolDeck) {
            const waterLs = spaces.filter(s => isWaterType(s.type))
              .map(s => localLayouts[s.id]).filter(Boolean)
            const deckSF = waterLs.length > 0
              ? Math.max(0, Math.round(rectUnionAreaFt([...autoDeckStripLayouts, ...waterLs]) - rectUnionAreaFt(waterLs)))
              : Math.round(rectUnionAreaFt(autoDeckStripLayouts))
            const deckOcc = Math.ceil(deckSF / IBC_LOAD_FACTORS["Pool Deck"])
            const bx0 = Math.min(...autoDeckStripLayouts.map(l => l.x))
            const by0 = Math.min(...autoDeckStripLayouts.map(l => l.y))
            const bx1 = Math.max(...autoDeckStripLayouts.map(l => l.x + l.w))
            const by1 = Math.max(...autoDeckStripLayouts.map(l => l.y + l.h))
            const lx = px((bx0+bx1)/2), ly = px((by0+by1)/2)
            labelEl = (
              <g textAnchor="middle" fontFamily="'Geist Mono',monospace" fill={colors.text}>
                <text x={lx} y={ly - 12} fontSize={9} fontWeight="700">Pool Deck (Auto)</text>
                <text x={lx} y={ly + 2}  fontSize={9} opacity={0.65}>{deckSF.toLocaleString()} SF</text>
                <text x={lx} y={ly + 18} fontSize={14} fontWeight="800">{deckOcc}</text>
                <text x={lx} y={ly + 28} fontSize={6.5} opacity={0.4}>OCC</text>
              </g>
            )
          }
          return (
            <g pointerEvents="none">
              {autoDeckStripLayouts.map((l, i) => (
                <rect key={`ads-${i}`}
                  x={px(l.x)} y={px(l.y)} width={px(l.w)} height={px(l.h)}
                  fill={colors.fill} fillOpacity={isDark ? 0.92 : 0.9}
                  stroke={colors.stroke} strokeWidth={1.5} rx={2}/>
              ))}
              {labelEl}
            </g>
          )
        })()}

        {/* ── ROOMS — larger areas rendered first (lower z) ── */}
        {[...spaces].sort((a, b) => {
          const la = localLayouts[a.id], lb = localLayouts[b.id]
          if (!la || !lb) return 0
          return (lb.w * lb.h) - (la.w * la.h)
        }).map(space => {
          const layout = localLayouts[space.id]
          if (!layout) return null
          const colors = palette[space.type] ?? fb
          const rx = px(layout.x), ry = px(layout.y)
          const rw = px(layout.w), rh = px(layout.h)
          const cx2 = rx + rw / 2, cy2 = ry + rh / 2
          const isSel = selected === space.id
          const sf = Math.round(layout.w * layout.h)
          const occ = Math.ceil(sf / IBC_LOAD_FACTORS[space.type])
          const isMerged = mergedWaterIds.has(space.id) || mergedAreaIds.has(space.id)
          const isPoolDeck = space.type === "Pool Deck"

          const hFill = isDark ? "#1e293b" : "#fff"

          return (
            <g key={space.id} onClick={e => { e.stopPropagation(); if (preDownSelRef.current.room === space.id) clearSelection() }}>
              {/* Room body — fill only; strokes rendered in separate passes for correct z-order */}
              <rect
                x={rx} y={ry} width={rw} height={rh}
                fill={colors.fill} stroke="none"
                rx={3}
                style={{ cursor: "grab" }}
                onPointerDown={e => startRoomDrag(e, space.id, "move")}
                onDoubleClick={e => { e.stopPropagation(); setEditingNameId(space.id) }}
              />
              {/* FAR band — tinted strip between outer+inner border lines (conditioned FAR rooms only) */}
              {space.isConditioned && !isMerged && !isPoolDeck && (space.impactsFAR ?? !isNonRoomType(space.type)) && (
                <>
                  <rect x={rx} y={ry} width={rw} height={rh}
                    fill={colors.stroke} fillOpacity={0.10} rx={3} pointerEvents="none" />
                  <rect x={rx + INNER_INSET} y={ry + INNER_INSET}
                    width={Math.max(0, rw - INNER_INSET * 2)} height={Math.max(0, rh - INNER_INSET * 2)}
                    fill={colors.fill} rx={Math.max(0, 3 - INNER_INSET)} pointerEvents="none" />
                </>
              )}

              {/* Conditioned accent bar — hidden for merged water (group overlay handles boundary) */}
              {space.isConditioned && !isMerged && (
                <rect x={rx + 3} y={ry} width={rw - 6} height={3}
                  fill={colors.stroke} fillOpacity={0.45} rx={1.5} pointerEvents="none" />
              )}

              {/* Rename input — appears on double-click for any rect, merged or not */}
              {editingNameId === space.id && rw > 28 && rh > 20 && (
                <foreignObject x={rx + 4} y={ry + 4} width={Math.max(48, rw - 8)} height={22} pointerEvents="all">
                  <input
                    autoFocus
                    defaultValue={space.name}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    onBlur={e => {
                      const v = e.currentTarget.value.trim()
                      if (v && v !== space.name) onRenameSpace?.(space.id, v)
                      setEditingNameId(null)
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const v = e.currentTarget.value.trim()
                        if (v && v !== space.name) onRenameSpace?.(space.id, v)
                        setEditingNameId(null)
                      } else if (e.key === "Escape") {
                        setEditingNameId(null)
                      }
                    }}
                    style={{
                      width: "100%", height: "100%", padding: "0 4px",
                      fontSize: 11, fontWeight: 700, fontFamily: "system-ui,sans-serif",
                      color: colors.text, background: hFill,
                      border: `1px solid ${colors.stroke}`, borderRadius: 3,
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </foreignObject>
              )}

              {/* Singleton label — name · SF · OCC centered in rect. Hidden for merged
                  rects (group overlay provides the combined label at union center). */}
              {!isMerged && editingNameId !== space.id && rw > 28 && rh > 20 && (
                <g pointerEvents="none">
                  {rh > 30 && (
                    <text x={cx2} y={cy2 - (rh > 60 ? 12 : 4)}
                      textAnchor="middle"
                      fontSize={Math.min(12, Math.max(8, rw / 9))}
                      fill={colors.text} fontWeight="700" fontFamily="system-ui,sans-serif">
                      {rw > 80 ? space.name : space.name.split(" ")[0]}
                    </text>
                  )}
                  {rh > 60 && rw > 40 && (
                    <text x={cx2} y={cy2 + 4}
                      textAnchor="middle"
                      fontSize={Math.min(10, Math.max(7, rw / 14))}
                      fill={colors.text} opacity={0.6} fontFamily="'Geist Mono',monospace">
                      {sf.toLocaleString()} SF
                    </text>
                  )}
                  {rh > 44 && (
                    <text x={cx2} y={cy2 + (rh > 60 ? 20 : 12)}
                      textAnchor="middle"
                      fontSize={Math.min(16, Math.max(9, rw / 5.5))}
                      fill={occColor} fontWeight="800" fontFamily="'Geist Mono',monospace">
                      {occ}
                    </text>
                  )}
                  {rh > 60 && rw > 36 && (
                    <text x={cx2} y={cy2 + (rh > 60 ? 30 : 22)}
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

              {/* Action buttons — top-right corner of selected room */}
              {isSel && (
                <g pointerEvents="all">
                  {onDuplicate && (
                    <g style={{ cursor: "pointer" }}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); onDuplicate(space.id) }}>
                      <rect x={rx + rw - 26} y={ry + 3} width={22} height={18} rx={3}
                        fill={hFill} fillOpacity={0.93} stroke={colors.stroke} strokeWidth={1} />
                      <text x={rx + rw - 15} y={ry + 15} textAnchor="middle" fontSize={11}
                        fill={colors.stroke} pointerEvents="none" fontFamily="system-ui,sans-serif">⧉</text>
                    </g>
                  )}
                  {onDeleteSpace && (
                    <g style={{ cursor: "pointer" }}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); clearSelection(); onDeleteSpace(space.id) }}>
                      <rect x={rx + rw - 52} y={ry + 3} width={22} height={18} rx={3}
                        fill={hFill} fillOpacity={0.93} stroke={colors.stroke} strokeWidth={1} />
                      <text x={rx + rw - 41} y={ry + 15} textAnchor="middle" fontSize={13}
                        fill={colors.stroke} pointerEvents="none" fontFamily="system-ui,sans-serif">×</text>
                    </g>
                  )}
                </g>
              )}
            </g>
          )
        })}

        {/*
          ── CANONICAL GROUP-OVERLAY PATTERN (used by BOTH waterGroups AND areaTypeGroups) ──
          Two SVG masks per rect (ri) achieve clean merged-room rendering:

          Outer mask  (id=`${maskBase}-m${ri}`)
            • Canvas starts WHITE (stroke visible everywhere)
            • Each OTHER rect is blacked out with a +2px buffer
            • Effect: only the external boundary of rect ri renders; internal shared edges are hidden

          Inner mask  (id=`${maskBase}-im${ri}`)
            • Canvas starts BLACK (stroke hidden everywhere)
            • Each OTHER rect is whited out (no buffer)
            • Effect: dashed strokes only appear INSIDE the shared overlap zone

          Label: SF then occ, centred in the largest member rect (always inside the compound)

          ⚠️  If you change one section you MUST change the other to match.
          ─────────────────────────────────────────────────────────────────────────────────────────
        */}

        {/* ── Water group combined outlines + combined label ── */}
        {waterGroups.map((group, gi) => {
          const ls = group.map(s => localLayouts[s.id]).filter(Boolean)
          if (ls.length < 2) return null
          const colors = palette[group[0].type] ?? fb
          const maskBase = `wg${gi}`
          const unionSF = Math.round(rectUnionAreaFt(ls))
          const unionOcc = Math.ceil(unionSF / 50)
          const bx0 = Math.min(...ls.map(l => l.x)), by0 = Math.min(...ls.map(l => l.y))
          const bx1 = Math.max(...ls.map(l => l.x+l.w)), by1 = Math.max(...ls.map(l => l.y+l.h))
          const labelX = px((bx0 + bx1) / 2)
          const labelY = px((by0 + by1) / 2)
          return (
            <g key={`wg-${gi}`} pointerEvents="none">
              <defs>
                {ls.map((_, ri) => (
                  <mask key={`o-${ri}`} id={`${maskBase}-m${ri}`}>
                    {/* Outer stroke mask: white everywhere except other rects (+ 2px buffer) */}
                    <rect fill="white" x={0} y={0} width={svgW} height={svgH}/>
                    {ls.filter((_,j) => j !== ri).map((l, j) => (
                      <rect key={j} fill="black"
                        x={px(l.x)-2} y={px(l.y)-2}
                        width={px(l.w)+4} height={px(l.h)+4}/>
                    ))}
                  </mask>
                ))}
                {ls.map((_, ri) => (
                  <mask key={`i-${ri}`} id={`${maskBase}-im${ri}`}>
                    {/* Inner dash mask: black everywhere except inside the other rects */}
                    <rect fill="black" x={0} y={0} width={svgW} height={svgH}/>
                    {ls.filter((_,j) => j !== ri).map((l, j) => (
                      <rect key={j} fill="white"
                        x={px(l.x)} y={px(l.y)}
                        width={px(l.w)} height={px(l.h)}/>
                    ))}
                  </mask>
                ))}
              </defs>
              {/* Outer boundary strokes — masked to hide the internal edges */}
              {ls.map((l, ri) => (
                <rect key={`outer-${ri}`}
                  x={px(l.x)} y={px(l.y)} width={px(l.w)} height={px(l.h)}
                  fill="none" stroke={colors.stroke} strokeWidth={1.5} rx={3}
                  mask={`url(#${maskBase}-m${ri})`}/>
              ))}
              {/* Inner dashes — show only inside the overlap zone, lightly distinguish bodies */}
              {ls.map((l, ri) => (
                <rect key={`dash-${ri}`}
                  x={px(l.x)} y={px(l.y)} width={px(l.w)} height={px(l.h)}
                  fill="none" stroke={colors.stroke} strokeWidth={1}
                  strokeDasharray="6 5" opacity={0.28} rx={3}
                  mask={`url(#${maskBase}-im${ri})`}/>
              ))}
              {/* Group label at union bounding-box center — name · SF · OCC */}
              <g pointerEvents="none" textAnchor="middle">
                <text x={labelX} y={labelY - 16}
                  fontSize={12} fontWeight="700"
                  fill={colors.text} fontFamily="system-ui,sans-serif">
                  {group[0].name}
                </text>
                <text x={labelX} y={labelY - 2}
                  fontSize={9} fill={colors.text} opacity={0.65}
                  fontFamily="'Geist Mono',monospace">
                  {unionSF.toLocaleString()} SF
                </text>
                <text x={labelX} y={labelY + 14}
                  fontSize={14} fontWeight="800" fill={occColor}
                  fontFamily="'Geist Mono',monospace">
                  {unionOcc}
                </text>
                <text x={labelX} y={labelY + 24}
                  fontSize={6.5} fill={colors.text} opacity={0.4}
                  fontFamily="'Geist Mono',monospace">
                  OCC
                </text>
              </g>
            </g>
          )
        })}

        {/* ── Non-water same-type group combined outlines + combined label ── (⚠️ keep in sync with waterGroups above — canonical pattern) */}
        {areaTypeGroups.map((group, gi) => {
          const ls = group.map(s => localLayouts[s.id]).filter(Boolean)
          if (ls.length < 2) return null
          const colors = palette[group[0].type] ?? fb
          const loadFactor = IBC_LOAD_FACTORS[group[0].type] ?? 100
          const maskBase = `tg${gi}`
          // Pool Deck overlay: show water-clipped SF (water owns contested zones).
          // Other area types: plain union.
          const isDeckGroup = group[0].type === "Pool Deck"
          const waterLs = isDeckGroup
            ? spaces.filter(s => isWaterType(s.type)).map(s => localLayouts[s.id]).filter(Boolean)
            : []
          const unionSF = isDeckGroup
            ? Math.max(0, Math.round(
                rectUnionAreaFt([...ls, ...autoDeckStripLayouts, ...waterLs]) - rectUnionAreaFt(waterLs)
              ))
            : Math.round(rectUnionAreaFt(ls))
          const unionOcc = Math.ceil(unionSF / loadFactor)
          const bx0 = Math.min(...ls.map(l => l.x)), by0 = Math.min(...ls.map(l => l.y))
          const bx1 = Math.max(...ls.map(l => l.x+l.w)), by1 = Math.max(...ls.map(l => l.y+l.h))
          const labelX = px((bx0 + bx1) / 2)
          const labelY = px((by0 + by1) / 2)
          return (
            <g key={`tg-${gi}`} pointerEvents="none">
              <defs>
                {ls.map((_, ri) => (
                  <mask key={`o-${ri}`} id={`${maskBase}-m${ri}`}>
                    {/* Outer stroke mask: white everywhere except other rects (+ 2px buffer) */}
                    <rect fill="white" x={0} y={0} width={svgW} height={svgH}/>
                    {ls.filter((_,j) => j !== ri).map((l, j) => (
                      <rect key={j} fill="black"
                        x={px(l.x)-2} y={px(l.y)-2}
                        width={px(l.w)+4} height={px(l.h)+4}/>
                    ))}
                  </mask>
                ))}
                {ls.map((_, ri) => (
                  <mask key={`i-${ri}`} id={`${maskBase}-im${ri}`}>
                    {/* Inner dash mask: black everywhere except inside the other rects */}
                    <rect fill="black" x={0} y={0} width={svgW} height={svgH}/>
                    {ls.filter((_,j) => j !== ri).map((l, j) => (
                      <rect key={j} fill="white"
                        x={px(l.x)} y={px(l.y)}
                        width={px(l.w)} height={px(l.h)}/>
                    ))}
                  </mask>
                ))}
              </defs>
              {/* Outer boundary strokes — masked to hide the internal edges */}
              {ls.map((l, ri) => (
                <rect key={`outer-${ri}`}
                  x={px(l.x)} y={px(l.y)} width={px(l.w)} height={px(l.h)}
                  fill="none" stroke={colors.stroke} strokeWidth={1.5} rx={3}
                  mask={`url(#${maskBase}-m${ri})`}/>
              ))}
              {/* Inner dashes — show only inside the overlap zone, lightly distinguish bodies */}
              {ls.map((l, ri) => (
                <rect key={`dash-${ri}`}
                  x={px(l.x)} y={px(l.y)} width={px(l.w)} height={px(l.h)}
                  fill="none" stroke={colors.stroke} strokeWidth={1}
                  strokeDasharray="6 5" opacity={0.28} rx={3}
                  mask={`url(#${maskBase}-im${ri})`}/>
              ))}
              {/* Group overlay label at union bounding-box center — name · SF · OCC */}
              <g pointerEvents="none" textAnchor="middle">
                <text x={labelX} y={labelY - 16}
                  fontSize={12} fontWeight="700"
                  fill={colors.text} fontFamily="system-ui,sans-serif">
                  {group[0].name}
                </text>
                <text x={labelX} y={labelY - 2}
                  fontSize={9} fill={colors.text} opacity={0.65}
                  fontFamily="'Geist Mono',monospace">
                  {unionSF.toLocaleString()} SF
                </text>
                <text x={labelX} y={labelY + 14}
                  fontSize={14} fontWeight="800" fill={occColor}
                  fontFamily="'Geist Mono',monospace">
                  {unionOcc}
                </text>
                <text x={labelX} y={labelY + 24}
                  fontSize={6.5} fill={colors.text} opacity={0.4}
                  fontFamily="'Geist Mono',monospace">
                  OCC
                </text>
              </g>
            </g>
          )
        })}

        {/* ── Unconditioned room stroke pass — dashed outer + dashed inner
            Excludes: merged rooms, pool deck (→ solid pass), water surfaces (→ own pass) ── */}
        {spaces.map(space => {
          const layout = localLayouts[space.id]
          if (!layout || space.isConditioned) return null
          if (isWaterType(space.type) || space.type === "Pool Deck") return null
          const isMerged = mergedWaterIds.has(space.id) || mergedAreaIds.has(space.id)
          if (isMerged) return null
          const colors = palette[space.type] ?? fb
          const isSel = selected === space.id
          const rx2 = px(layout.x), ry2 = px(layout.y)
          const rw2 = px(layout.w), rh2 = px(layout.h)
          const sw = isSel ? 2.5 : 1.5
          return (
            <g key={`unc-${space.id}`} pointerEvents="none">
              <rect x={rx2} y={ry2} width={rw2} height={rh2}
                fill="none" stroke={colors.stroke} strokeWidth={sw} strokeDasharray="6 3" rx={3}/>
              {rw2 > INNER_INSET * 2 + 4 && rh2 > INNER_INSET * 2 + 4 && (
                <rect x={rx2 + INNER_INSET} y={ry2 + INNER_INSET}
                  width={rw2 - INNER_INSET * 2} height={rh2 - INNER_INSET * 2}
                  fill="none" stroke={colors.stroke} strokeWidth={1} strokeDasharray="6 3"
                  opacity={0.45} rx={Math.max(0, 3 - INNER_INSET)}/>
              )}
            </g>
          )
        })}

        {/* ── Non-merged water surface stroke pass — solid outer only, no inner ring ── */}
        {spaces.map(space => {
          if (!isWaterType(space.type)) return null
          const layout = localLayouts[space.id]
          if (!layout || mergedWaterIds.has(space.id)) return null
          const colors = palette[space.type] ?? fb
          const isSel = selected === space.id
          return (
            <rect key={`ws-${space.id}`}
              x={px(layout.x)} y={px(layout.y)} width={px(layout.w)} height={px(layout.h)}
              fill="none" stroke={colors.stroke} strokeWidth={isSel ? 2.5 : 1.5} rx={3}
              pointerEvents="none" />
          )
        })}

        {/* ── Conditioned + pool deck solid-stroke pass — solid outer + solid inner, above dashes at colinear edges
            Pool deck gets outer only (no inner ring — it's not a room). ── */}
        {spaces.map(space => {
          const layout = localLayouts[space.id]
          if (!layout) return null
          const isPoolDeck = space.type === "Pool Deck"
          if (!space.isConditioned && !isPoolDeck) return null
          if (isWaterType(space.type)) return null
          const isMerged = mergedWaterIds.has(space.id) || mergedAreaIds.has(space.id)
          if (isMerged) return null
          const colors = palette[space.type] ?? fb
          const isSel = selected === space.id
          const rx2 = px(layout.x), ry2 = px(layout.y)
          const rw2 = px(layout.w), rh2 = px(layout.h)
          const sw = isSel ? 2.5 : 1.5
          return (
            <g key={`solid-${space.id}`} pointerEvents="none">
              <rect x={rx2} y={ry2} width={rw2} height={rh2}
                fill="none" stroke={colors.stroke} strokeWidth={sw} rx={3}/>
              {!isPoolDeck && rw2 > INNER_INSET * 2 + 4 && rh2 > INNER_INSET * 2 + 4 && (
                <rect x={rx2 + INNER_INSET} y={ry2 + INNER_INSET}
                  width={rw2 - INNER_INSET * 2} height={rh2 - INNER_INSET * 2}
                  fill="none" stroke={colors.stroke} strokeWidth={1}
                  opacity={0.45} rx={Math.max(0, 3 - INNER_INSET)}/>
              )}
            </g>
          )
        })}

        {/* ── EQUIPMENT (on top of rooms) ── */}
        {instances.map(({ key, item, color, label, unitSF }) => {
          const pos = equipPos[key]
          if (!pos) return null
          const dims = getEquipDims(item, equipSizes[item.id])
          const { w: fw, h: fh, clearW, clearH, borderX, borderY } = dims
          const fpOff = fpOffsets[key] ?? { x: borderX, y: borderY }
          const clearX = px(pos.x - borderX), clearY = px(pos.y - borderY)
          const fpX = px(pos.x - borderX + fpOff.x)
          const fpY = px(pos.y - borderY + fpOff.y)
          const fpW = px(fw), fpH = px(fh)
          const clW = px(clearW), clH = px(clearH)
          const isDraggingZone = drag?.kind === "equip-zone" && drag.key === key
          const isDraggingFp = drag?.kind === "equip-fp" && drag.key === key
          const isSel = selectedEquip === key
          const fSize = Math.max(7, Math.min(11, Math.min(fpW, fpH) / 3.5))
          const hFillE = isDark ? "#1e293b" : "#fff"
          const hasClearance = clearW > fw || clearH > fh

          return (
            <g key={key} onClick={e => { e.stopPropagation(); if (preDownSelRef.current.equip === key) clearSelection() }}>
              {/* Clearance zone — drag to move whole unit */}
              <rect
                x={clearX} y={clearY} width={clW} height={clH}
                fill={color} fillOpacity={isDraggingZone ? 0.12 : 0.06}
                stroke={color} strokeWidth={isSel ? 1.5 : 1} strokeDasharray="5 3" rx={3}
                style={{ cursor: isDraggingZone ? "grabbing" : "grab" }}
                onPointerDown={e => startEquipZoneDrag(e, key)}
              />
              {/* Footprint — drag within clearance zone */}
              <rect
                x={fpX} y={fpY} width={fpW} height={fpH}
                fill={color} fillOpacity={isDraggingFp ? 0.55 : 0.22}
                stroke={color} strokeWidth={1.5} rx={2}
                style={{ cursor: isDraggingFp ? "grabbing" : "crosshair" }}
                onPointerDown={e => startEquipFpDrag(e, key, borderX, borderY)}
              />
              {/* Labels on footprint */}
              <g pointerEvents="none">
                <text x={fpX + fpW / 2} y={fpY + fpH / 2 - fSize * 0.5}
                  textAnchor="middle" fontSize={fSize}
                  fill={color} fontWeight="600" fontFamily="system-ui,sans-serif">
                  {label}
                </text>
                <text x={fpX + fpW / 2} y={fpY + fpH / 2 + fSize * 0.9}
                  textAnchor="middle" fontSize={Math.max(6, fSize - 2)}
                  fill={color} opacity={0.75} fontFamily="'Geist Mono',monospace">
                  {unitSF} SF
                </text>
              </g>

              {/* Dimension callouts when selected */}
              {isSel && (
                <g pointerEvents="none" fontSize={9} fontFamily="'Geist Mono',monospace" fill={dimColor}>
                  {/* Footprint dims below footprint */}
                  <line x1={fpX} y1={fpY + fpH + 10} x2={fpX + fpW} y2={fpY + fpH + 10} stroke={dimColor} strokeWidth={0.7} />
                  <line x1={fpX} y1={fpY + fpH + 7} x2={fpX} y2={fpY + fpH + 13} stroke={dimColor} strokeWidth={0.7} />
                  <line x1={fpX + fpW} y1={fpY + fpH + 7} x2={fpX + fpW} y2={fpY + fpH + 13} stroke={dimColor} strokeWidth={0.7} />
                  <text x={fpX + fpW / 2} y={fpY + fpH + 21} textAnchor="middle">{ftArch(fw)}×{ftArch(fh)} fp</text>
                  {/* Clearance dims below clearance zone */}
                  {hasClearance && <>
                    <line x1={clearX} y1={clearY + clH + 28} x2={clearX + clW} y2={clearY + clH + 28} stroke={dimColor} strokeWidth={0.7} />
                    <line x1={clearX} y1={clearY + clH + 25} x2={clearX} y2={clearY + clH + 31} stroke={dimColor} strokeWidth={0.7} />
                    <line x1={clearX + clW} y1={clearY + clH + 25} x2={clearX + clW} y2={clearY + clH + 31} stroke={dimColor} strokeWidth={0.7} />
                    <text x={clearX + clW / 2} y={clearY + clH + 39} textAnchor="middle">{ftArch(clearW)}×{ftArch(clearH)} clr</text>
                  </>}
                </g>
              )}
              {/* Footprint resize handles: right edge + bottom edge — overlay follows cursor when hovered */}
              {isSel && (() => {
                const handles = [
                  { hkey: `ef-${key}-right`,  x: fpX + fpW - 4,         y: fpY + fpH / 2 - 13, w: 8,  h: 26, cursor: "ew-resize" as const, followOpts: { followYBounds: [fpY + 13, fpY + fpH - 13] as [number, number] }, onPD: (e: React.PointerEvent<SVGRectElement>) => { e.stopPropagation(); startEquipResizeFp(e, key, item.id, "right",  fw, fh) } },
                  { hkey: `ef-${key}-bottom`, x: fpX + fpW / 2 - 13, y: fpY + fpH - 4,         w: 26, h: 8,  cursor: "ns-resize" as const, followOpts: { followXBounds: [fpX + 13, fpX + fpW - 13] as [number, number] }, onPD: (e: React.PointerEvent<SVGRectElement>) => { e.stopPropagation(); startEquipResizeFp(e, key, item.id, "bottom", fw, fh) } },
                ]
                return handles.map(({ hkey, x, y, w, h, cursor, followOpts, onPD }) => {
                  const isTop = handleOverlay?.key === hkey
                  const isEW = cursor === "ew-resize"
                  return (
                    <g key={hkey} style={{ opacity: isTop ? 0 : undefined, pointerEvents: isTop ? "none" : undefined }}>
                      <rect
                        x={isEW ? x - Math.floor((HSHORT_HIT - w) / 2) : x}
                        y={isEW ? y : y - Math.floor((HSHORT_HIT - h) / 2)}
                        width={isEW ? HSHORT_HIT : w} height={isEW ? h : HSHORT_HIT}
                        fill="transparent" strokeWidth={0} style={{ cursor }}
                        onPointerDown={onPD}
                        onPointerEnter={() => setHandleOverlay({ key: hkey, x, y, w, h, fill: hFillE, stroke: color, sw: 1.5, cursor, ...followOpts, onPointerDown: onPD })}
                      />
                      <rect x={x} y={y} width={w} height={h}
                        fill={hFillE} stroke={color} strokeWidth={1.5} rx={HRADIUS}
                        pointerEvents="none" />
                    </g>
                  )
                })
              })()}
              {/* Clearance zone resize handles: right edge + bottom edge — overlay follows cursor when hovered */}
              {isSel && hasClearance && (() => {
                const handles = [
                  { hkey: `ez-${key}-right`,  x: clearX + clW - 4,         y: clearY + clH / 2 - 13, w: 8,  h: 26, cursor: "ew-resize" as const, followOpts: { followYBounds: [clearY + 13, clearY + clH - 13] as [number, number] }, onPD: (e: React.PointerEvent<SVGRectElement>) => { e.stopPropagation(); startEquipResizeZone(e, key, item.id, "right",  clearW, clearH, fw, fh) } },
                  { hkey: `ez-${key}-bottom`, x: clearX + clW / 2 - 13, y: clearY + clH - 4,         w: 26, h: 8,  cursor: "ns-resize" as const, followOpts: { followXBounds: [clearX + 13, clearX + clW - 13] as [number, number] }, onPD: (e: React.PointerEvent<SVGRectElement>) => { e.stopPropagation(); startEquipResizeZone(e, key, item.id, "bottom", clearW, clearH, fw, fh) } },
                ]
                return handles.map(({ hkey, x, y, w, h, cursor, followOpts, onPD }) => {
                  const isTop = handleOverlay?.key === hkey
                  const isEW = cursor === "ew-resize"
                  return (
                    <g key={hkey} style={{ opacity: isTop ? 0 : undefined, pointerEvents: isTop ? "none" : undefined }}>
                      <rect
                        x={isEW ? x - Math.floor((HSHORT_HIT - w) / 2) : x}
                        y={isEW ? y : y - Math.floor((HSHORT_HIT - h) / 2)}
                        width={isEW ? HSHORT_HIT : w} height={isEW ? h : HSHORT_HIT}
                        fill="transparent" strokeWidth={0} style={{ cursor }}
                        onPointerDown={onPD}
                        onPointerEnter={() => setHandleOverlay({ key: hkey, x, y, w, h, fill: hFillE, stroke: color, sw: 1, cursor, ...followOpts, onPointerDown: onPD })}
                      />
                      <rect x={x} y={y} width={w} height={h}
                        fill={hFillE} stroke={color} strokeWidth={1} rx={HRADIUS}
                        pointerEvents="none" />
                    </g>
                  )
                })
              })()}
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
            <g key="enclosure" onClick={e => { e.stopPropagation(); if (preDownSelRef.current.enclosure) clearSelection() }}>
              <rect
                x={ex} y={ey} width={ew} height={eh}
                fill="none"
                stroke={encStroke} strokeWidth={selectedEnclosure ? 3 : 2.5} strokeDasharray="10 6"
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
              {selectedEnclosure && (["left","right","top","bottom"] as RoomHandle[]).map(side => {
                const isLR = side === "left" || side === "right"
                const hx = side === "left" ? ex - 4
                  : side === "right" ? ex + ew - 4
                  : Math.max(ex, Math.min(ex + ew - 26, ecx - 13))
                const hy = side === "top" ? ey - 4
                  : side === "bottom" ? ey + eh - 4
                  : Math.max(ey, Math.min(ey + eh - 26, ecy - 13))
                const hw = isLR ? 8 : 26
                const hh = isLR ? 26 : 8
                const cur = isLR ? "ew-resize" : "ns-resize"
                const hkey = `enc-${side}`
                const isTop = handleOverlay?.key === hkey
                const onPD = (e: React.PointerEvent<SVGRectElement>) => startEnclosureDrag(e, side)
                const followOpts = isLR
                  ? { followYBounds: [ey + 13, ey + eh - 13] as [number, number] }
                  : { followXBounds: [ex + 13, ex + ew - 13] as [number, number] }
                return (
                  <g key={side} style={{ opacity: isTop ? 0 : undefined, pointerEvents: isTop ? "none" : undefined }}>
                    <rect
                      x={isLR ? hx - Math.floor((HSHORT_HIT - hw) / 2) : hx}
                      y={isLR ? hy : hy - Math.floor((HSHORT_HIT - hh) / 2)}
                      width={isLR ? HSHORT_HIT : hw} height={isLR ? hh : HSHORT_HIT}
                      fill="transparent" strokeWidth={0} style={{ cursor: cur }}
                      onPointerDown={onPD}
                      onPointerEnter={() => setHandleOverlay({ key: hkey, x: hx, y: hy, w: hw, h: hh, fill: hFill, stroke: encStroke, sw: 1.5, cursor: cur, ...followOpts, onPointerDown: onPD })}
                    />
                    <rect x={hx} y={hy} width={hw} height={hh}
                      fill={hFill} stroke={encStroke} strokeWidth={1.5} rx={3}
                      pointerEvents="none" />
                  </g>
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

              {/* ── Circulation baseline label — top-right, outside enclosure ── */}
              {(() => {
                const encl = localEnclosure!
                const enclArea = Math.round(encl.w * encl.h)
                const occupiedSF = spaces.reduce((a, s) => {
                  const l = localLayouts[s.id]
                  if (!l || !rectsOverlap(l, encl)) return a
                  const iw = Math.max(0, Math.min(l.x + l.w, encl.x + encl.w) - Math.max(l.x, encl.x))
                  const ih = Math.max(0, Math.min(l.y + l.h, encl.y + encl.h) - Math.max(l.y, encl.y))
                  return a + Math.round(iw * ih)
                }, 0)
                const circSF = Math.max(0, enclArea - occupiedSF)
                const circOcc = circSF > 0 ? Math.ceil(circSF / 15) : 0
                const circColor = isDark ? "#9ca3af" : "#6b7280"
                const circBg = isDark ? "#1c1c1c" : "#f9fafb"
                const circBorder = isDark ? "#374151" : "#d1d5db"
                const lx = ex + ew + 44
                const ly = ey
                const bw = 94, bh = 58
                return (
                  <g pointerEvents="none">
                    <rect x={lx} y={ly} width={bw} height={bh}
                      fill={circBg} fillOpacity={0.96}
                      stroke={circBorder} strokeWidth={1} rx={4} />
                    <text x={lx + 8} y={ly + 13}
                      fontSize={6.5} fill={circColor} fontFamily="'Geist Mono',monospace"
                      fontWeight="700" letterSpacing={0.8} opacity={0.65}>
                      CIRCULATION
                    </text>
                    <text x={lx + 8} y={ly + 28}
                      fontSize={11} fill={circColor} fontFamily="'Geist Mono',monospace">
                      {circSF.toLocaleString()} SF
                    </text>
                    <text x={lx + 8} y={ly + 48}
                      fontSize={16} fill={occColor} fontFamily="'Geist Mono',monospace"
                      fontWeight="800">
                      {circOcc}
                    </text>
                    <text x={lx + 8 + (circOcc.toString().length * 9.6) + 4} y={ly + 48}
                      fontSize={7} fill={circColor} fontFamily="'Geist Mono',monospace"
                      opacity={0.55}>
                      OCC
                    </text>
                  </g>
                )
              })()}
            </g>
          )
        })()}

        {/* ── Selected room resize handles — at high z so they're reachable when covered by merged rooms ── */}
        {selected && (() => {
          const space = spaces.find(s => s.id === selected)
          if (!space) return null
          const layout = localLayouts[space.id]
          if (!layout) return null
          const colors = palette[space.type] ?? fb
          const rx = px(layout.x), ry = px(layout.y)
          const rw = px(layout.w), rh = px(layout.h)
          const cx2 = rx + rw / 2, cy2 = ry + rh / 2
          const hFill = isDark ? "#1e293b" : "#fff"
          return (["left","right","top","bottom"] as RoomHandle[]).map(side => {
            const isLR = side === "left" || side === "right"
            const hx = side === "left" ? rx - HSHORT / 2
              : side === "right" ? rx + rw - HSHORT / 2
              : Math.max(rx, Math.min(rx + rw - HLONG, cx2 - HLONG / 2))
            const hy = side === "top" ? ry - HSHORT / 2
              : side === "bottom" ? ry + rh - HSHORT / 2
              : Math.max(ry, Math.min(ry + rh - HLONG, cy2 - HLONG / 2))
            const hw = isLR ? HSHORT : HLONG
            const hh = isLR ? HLONG : HSHORT
            const cursor = isLR ? "ew-resize" : "ns-resize"
            const hkey = `r-${space.id}-${side}`
            const isTop = handleOverlay?.key === hkey
            const onPD = (e: React.PointerEvent<SVGRectElement>) => startRoomDrag(e, space.id, side)
            const followOpts = isLR
              ? { followYBounds: [ry + HLONG / 2, ry + rh - HLONG / 2] as [number, number] }
              : { followXBounds: [rx + HLONG / 2, rx + rw - HLONG / 2] as [number, number] }
            return (
              <g key={`sel-handle-${side}`} style={{ opacity: isTop ? 0 : undefined, pointerEvents: isTop ? "none" : undefined }}>
                {/* Larger transparent hit area */}
                <rect
                  x={isLR ? hx - (HSHORT_HIT - HSHORT) / 2 : hx}
                  y={isLR ? hy : hy - (HSHORT_HIT - HSHORT) / 2}
                  width={isLR ? HSHORT_HIT : hw} height={isLR ? hh : HSHORT_HIT}
                  fill="transparent" strokeWidth={0} style={{ cursor }}
                  onPointerDown={onPD}
                  onPointerEnter={() => setHandleOverlay({ key: hkey, x: hx, y: hy, w: hw, h: hh, fill: hFill, stroke: colors.stroke, sw: 1.5, cursor, ...followOpts, onPointerDown: onPD })}
                />
                {/* Visual pill — HSHORT wide so it doesn't look "big" */}
                <rect x={hx} y={hy} width={hw} height={hh}
                  fill={hFill} stroke={colors.stroke} strokeWidth={1.5} rx={HRADIUS}
                  pointerEvents="none" />
              </g>
            )
          })
        })()}

        {/* Handle overlay — hovered handle re-rendered on top; position follows cursor along its edge.
            During an active drag, skip bounds clamping so the handle tracks the cursor freely. */}
        {handleOverlay && (() => {
          const inDrag = drag !== null
          const ox = handleOverlay.followXBounds && cursorPx
            ? (inDrag
                ? cursorPx.x - handleOverlay.w / 2
                : Math.max(handleOverlay.followXBounds[0], Math.min(handleOverlay.followXBounds[1], cursorPx.x)) - handleOverlay.w / 2)
            : handleOverlay.x
          const oy = handleOverlay.followYBounds && cursorPx
            ? (inDrag
                ? cursorPx.y - handleOverlay.h / 2
                : Math.max(handleOverlay.followYBounds[0], Math.min(handleOverlay.followYBounds[1], cursorPx.y)) - handleOverlay.h / 2)
            : handleOverlay.y
          return (
            <rect
              x={ox} y={oy}
              width={handleOverlay.w} height={handleOverlay.h}
              fill={handleOverlay.fill} stroke={handleOverlay.stroke} strokeWidth={handleOverlay.sw}
              rx={HRADIUS}
              style={{ cursor: handleOverlay.cursor }}
              onPointerDown={handleOverlay.onPointerDown}
              onPointerLeave={() => setHandleOverlay(null)}
            />
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
