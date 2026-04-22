"use client"

import { useState, useRef, useMemo, useEffect, useCallback } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { EquipmentItem, SpaceArea } from "@/lib/types"

// ─── Scale constants ──────────────────────────────────────────────────────────
const PX = 14           // pixels per foot
const CW = 70           // canvas width (ft)
const EH = 40           // equipment canvas height (ft)
const SH = 55           // space canvas height (ft)
const POOL_DECK_MIN_OFFSET = 3  // ft minimum pool deck clearance from water
const SNAP = 0.5        // 6-inch grid snap

// ─── Palette ─────────────────────────────────────────────────────────────────
const EQUIP_PALETTE = [
  "#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6",
  "#EC4899","#14B8A6","#F97316","#84CC16","#06B6D4",
]

const SPACE_COLORS: Record<string, { fill: string; stroke: string }> = {
  "Swimming Pool (Water Surface)": { fill:"#BFDBFE", stroke:"#2563EB" },
  "Pool Deck":                     { fill:"#FDE68A", stroke:"#D97706" },
  "Exercise Room (Equipment)":     { fill:"#DCFCE7", stroke:"#16A34A" },
  "Exercise Room (Concentrated)":  { fill:"#D1FAE5", stroke:"#059669" },
  "Sauna/Steam Room":              { fill:"#FEE2E2", stroke:"#DC2626" },
  "Cold Plunge (Water Surface)":   { fill:"#BAE6FD", stroke:"#0284C7" },
  "Spa/Hot Tub (Water Surface)":   { fill:"#EDE9FE", stroke:"#7C3AED" },
  "Locker Room":                   { fill:"#E0F2FE", stroke:"#0369A1" },
  "Lobby/Reception":               { fill:"#F0FDF4", stroke:"#15803D" },
  "Restroom":                      { fill:"#F5F3FF", stroke:"#7C3AED" },
  "Circulation":                   { fill:"#F3F4F6", stroke:"#6B7280" },
  "Lounge/Seating Area":           { fill:"#FFF7ED", stroke:"#C2410C" },
  "Storage":                       { fill:"#F9FAFB", stroke:"#9CA3AF" },
  "Mechanical":                    { fill:"#F9FAFB", stroke:"#9CA3AF" },
  "Office":                        { fill:"#FFFBEB", stroke:"#B45309" },
}

const HANDLE_CURSORS: Record<string,string> = {
  nw:"nw-resize", n:"n-resize", ne:"ne-resize",
  e:"e-resize",   se:"se-resize", s:"s-resize",
  sw:"sw-resize", w:"w-resize",
}

// ─── Types ────────────────────────────────────────────────────────────────────
type IKey = string
type EqPositions  = Record<IKey, { x: number; y: number }>
type SpaceRect    = { x: number; y: number; w: number; h: number }
type SpaceRects   = Record<string, SpaceRect>
type ResizeHandle = "nw"|"n"|"ne"|"e"|"se"|"s"|"sw"|"w"

type EqDrag    = { key: IKey; ox: number; oy: number }
type SpaceDrag =
  | { kind:"move";   id:string; ox:number; oy:number }
  | { kind:"resize"; id:string; handle:ResizeHandle; sx:number; sy:number; sr:SpaceRect }

// ─── Geometry helpers ─────────────────────────────────────────────────────────
const snap = (v: number) => Math.round(v / SNAP) * SNAP

function equipDims(item: EquipmentItem) {
  const fw = Math.sqrt(item.footprint)
  const border = item.accessSpace > 0
    ? (Math.sqrt(fw * fw + item.accessSpace) - fw) / 2
    : 0
  return { fw, border }
}

function overlapArea(ax:number,ay:number,aw:number,ah:number,
                     bx:number,by:number,bw:number,bh:number) {
  return Math.max(0, Math.min(ax+aw,bx+bw)-Math.max(ax,bx))
       * Math.max(0, Math.min(ay+ah,by+bh)-Math.max(ay,by))
}

// Enforce pool deck must be ≥ POOL_DECK_MIN_OFFSET ft outside pool water on all sides
function clampPoolDeck(deck: SpaceRect, pw: SpaceRect): SpaceRect {
  const M = POOL_DECK_MIN_OFFSET
  const x = Math.min(deck.x, pw.x - M)
  const y = Math.min(deck.y, pw.y - M)
  const r = Math.max(deck.x + deck.w, pw.x + pw.w + M)
  const b = Math.max(deck.y + deck.h, pw.y + pw.h + M)
  return { x, y, w: r - x, h: b - y }
}

function applyResize(handle: ResizeHandle, sr: SpaceRect, dx: number, dy: number): SpaceRect {
  const MIN = 3
  let { x, y, w, h } = sr
  if (handle.includes("w")) { x = snap(sr.x + dx); w = Math.max(MIN, snap(sr.w - dx)) }
  if (handle.includes("e")) { w = Math.max(MIN, snap(sr.w + dx)) }
  if (handle.includes("n")) { y = snap(sr.y + dy); h = Math.max(MIN, snap(sr.h - dy)) }
  if (handle.includes("s")) { h = Math.max(MIN, snap(sr.h + dy)) }
  return { x, y, w, h }
}

// ─── Default layout builders ──────────────────────────────────────────────────
function buildDefaultEquipPositions(items: EquipmentItem[]): EqPositions {
  const pos: EqPositions = {}
  let cx = 2, cy = 2, rowH = 0
  for (const item of items) {
    const { fw, border } = equipDims(item)
    const sw = fw + 2*border, sh = fw + 2*border
    for (let i = 0; i < item.quantity; i++) {
      if (cx + sw > CW - 2 && cx > 2) { cx=2; cy+=rowH+1.5; rowH=0 }
      pos[`${item.id}:${i}`] = { x: cx+border, y: cy+border }
      cx += sw+1.5; rowH = Math.max(rowH, sh)
    }
  }
  return pos
}

function buildDefaultSpaceRects(spaces: SpaceArea[]): SpaceRects {
  const rects: SpaceRects = {}
  const pw = spaces.find(s => s.type === "Swimming Pool (Water Surface)")
  const others = spaces.filter(s =>
    s.type !== "Swimming Pool (Water Surface)" && s.type !== "Pool Deck")
  const decks  = spaces.filter(s => s.type === "Pool Deck")

  // Place pool water first
  if (pw) {
    const side = Math.max(4, Math.sqrt(pw.squareFeet))
    rects[pw.id] = { x:4, y:4, w:side, h:side }
  }
  // Pool deck wraps pool water
  for (const deck of decks) {
    if (pw && rects[pw.id]) {
      const p = rects[pw.id]
      rects[deck.id] = {
        x: p.x - POOL_DECK_MIN_OFFSET,
        y: p.y - POOL_DECK_MIN_OFFSET,
        w: p.w + POOL_DECK_MIN_OFFSET * 2,
        h: p.h + POOL_DECK_MIN_OFFSET * 2,
      }
    }
  }
  // Other spaces stacked to the right of the pool complex
  const pwRight = pw
    ? (rects[pw.id].x - POOL_DECK_MIN_OFFSET) + (rects[pw.id].w + POOL_DECK_MIN_OFFSET*2) + 2
    : 2
  let cy = 2
  for (const space of others) {
    const side = Math.max(4, Math.sqrt(space.squareFeet))
    rects[space.id] = { x: pwRight, y: cy, w: side, h: side }
    cy += side + 2
  }
  return rects
}

function mergeEqPositions(items: EquipmentItem[], stored?: EqPositions): EqPositions {
  const defaults = buildDefaultEquipPositions(items)
  if (!stored) return defaults
  const out: EqPositions = {}
  for (const item of items)
    for (let i=0; i<item.quantity; i++) {
      const k=`${item.id}:${i}`; out[k]=stored[k]??defaults[k]
    }
  return out
}

function mergeSpaceRects(spaces: SpaceArea[], stored?: SpaceRects): SpaceRects {
  const defaults = buildDefaultSpaceRects(spaces)
  if (!stored) return defaults
  const out: SpaceRects = {}
  for (const s of spaces) out[s.id] = stored[s.id] ?? defaults[s.id]
  return out
}

// ─── Component ────────────────────────────────────────────────────────────────
export interface SpacePlannerProps {
  equipment: EquipmentItem[]
  spaces: SpaceArea[]
  storedEquipPositions?: EqPositions
  storedSpaceRects?: SpaceRects
  onEquipPositionsChange: (p: EqPositions) => void
  onSpaceRectsChange: (r: SpaceRects) => void
}

export function SpacePlanner({
  equipment, spaces,
  storedEquipPositions, storedSpaceRects,
  onEquipPositionsChange, onSpaceRectsChange,
}: SpacePlannerProps) {

  const eqSvgRef    = useRef<SVGSVGElement>(null)
  const spaceSvgRef = useRef<SVGSVGElement>(null)

  // ── Equipment state ─────────────────────────────────────────────────────────
  const storedEqRef = useRef(storedEquipPositions)
  const [eqPos, setEqPos] = useState<EqPositions>(() =>
    mergeEqPositions(equipment, storedEquipPositions))
  const [eqDrag, setEqDrag] = useState<EqDrag|null>(null)

  useEffect(() => {
    if (storedEquipPositions !== storedEqRef.current) {
      storedEqRef.current = storedEquipPositions
      setEqPos(mergeEqPositions(equipment, storedEquipPositions))
    }
  }, [storedEquipPositions, equipment])

  // ── Space state ─────────────────────────────────────────────────────────────
  const storedSpRef = useRef(storedSpaceRects)
  const [spRects, setSpRects] = useState<SpaceRects>(() =>
    mergeSpaceRects(spaces, storedSpaceRects))
  const [spaceDrag, setSpaceDrag] = useState<SpaceDrag|null>(null)
  const [selectedId, setSelectedId] = useState<string|null>(null)

  useEffect(() => {
    if (storedSpaceRects !== storedSpRef.current) {
      storedSpRef.current = storedSpaceRects
      setSpRects(mergeSpaceRects(spaces, storedSpaceRects))
    }
  }, [storedSpaceRects, spaces])

  // ── Equipment instances ─────────────────────────────────────────────────────
  const eqInstances = useMemo(() =>
    equipment.flatMap((item, idx) => {
      const { fw, border } = equipDims(item)
      return Array.from({length:item.quantity},(_,i) => ({
        key:`${item.id}:${i}` as IKey, item, fw, border,
        color: EQUIP_PALETTE[idx % EQUIP_PALETTE.length],
        label: item.quantity>1 ? `${item.name} ${i+1}` : item.name,
      }))
    }), [equipment])

  const overlapSF = useMemo(() => {
    const rs = eqInstances.map(({key,fw,border}) => {
      const p = eqPos[key] ?? {x:0,y:0}
      const s = fw+2*border
      return {x:p.x-border,y:p.y-border,w:s,h:s}
    })
    let t=0
    for(let i=0;i<rs.length;i++)
      for(let j=i+1;j<rs.length;j++)
        t+=overlapArea(rs[i].x,rs[i].y,rs[i].w,rs[i].h,rs[j].x,rs[j].y,rs[j].w,rs[j].h)
    return t
  }, [eqInstances, eqPos])

  const totalReqSF = useMemo(() => equipment.reduce((s,it) => {
    const shared = it.sharedClearance??0
    return s+(it.footprint+it.accessSpace)*it.quantity - shared*Math.max(0,it.quantity-1)
  },0), [equipment])

  // ── Equipment pointer helpers ────────────────────────────────────────────────
  function eqFt(e: React.PointerEvent) {
    const r = eqSvgRef.current!.getBoundingClientRect()
    return {x:(e.clientX-r.left)/PX, y:(e.clientY-r.top)/PX}
  }
  function onEqItemDown(e: React.PointerEvent<SVGGElement>, key:IKey) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const ft=eqFt(e); const p=eqPos[key]
    setEqDrag({key, ox:ft.x-p.x, oy:ft.y-p.y})
  }
  function onEqSvgMove(e: React.PointerEvent<SVGSVGElement>) {
    if(!eqDrag) return
    const ft=eqFt(e)
    const x=Math.max(0,snap(ft.x-eqDrag.ox))
    const y=Math.max(0,snap(ft.y-eqDrag.oy))
    setEqPos(prev=>({...prev,[eqDrag.key]:{x,y}}))
  }
  function onEqSvgUp() {
    if(!eqDrag) return
    onEquipPositionsChange(eqPos); setEqDrag(null)
  }
  function resetEquip() {
    const f=buildDefaultEquipPositions(equipment)
    setEqPos(f); onEquipPositionsChange(f)
  }

  // ── Space pointer helpers ────────────────────────────────────────────────────
  const poolWater = useMemo(()=>spaces.find(s=>s.type==="Swimming Pool (Water Surface)"), [spaces])

  function spaceFt(e: React.PointerEvent) {
    const r = spaceSvgRef.current!.getBoundingClientRect()
    return {x:(e.clientX-r.left)/PX, y:(e.clientY-r.top)/PX}
  }

  const constrainRect = useCallback((id:string, rect:SpaceRect): SpaceRect => {
    const space = spaces.find(s=>s.id===id)
    if(space?.type==="Pool Deck" && poolWater && spRects[poolWater.id])
      return clampPoolDeck(rect, spRects[poolWater.id])
    if(space?.type==="Swimming Pool (Water Surface)") {
      // when pool water moves, we'll handle pool deck cascade on pointer up
    }
    return rect
  }, [spaces, poolWater, spRects])

  function onSpaceDown(e: React.PointerEvent<SVGGElement>, id:string) {
    e.currentTarget.setPointerCapture(e.pointerId)
    e.stopPropagation()
    const ft=spaceFt(e); const r=spRects[id]
    setSelectedId(id)
    setSpaceDrag({kind:"move", id, ox:ft.x-r.x, oy:ft.y-r.y})
  }
  function onHandleDown(e: React.PointerEvent<SVGRectElement>, id:string, handle:ResizeHandle) {
    e.currentTarget.setPointerCapture(e.pointerId)
    e.stopPropagation()
    const ft=spaceFt(e)
    setSpaceDrag({kind:"resize", id, handle, sx:ft.x, sy:ft.y, sr:{...spRects[id]}})
  }
  function onSpaceSvgDown() { setSelectedId(null) }

  function onSpaceSvgMove(e: React.PointerEvent<SVGSVGElement>) {
    if(!spaceDrag) return
    const ft=spaceFt(e)
    if(spaceDrag.kind==="move") {
      const raw:SpaceRect={
        ...spRects[spaceDrag.id],
        x:snap(Math.max(0,ft.x-spaceDrag.ox)),
        y:snap(Math.max(0,ft.y-spaceDrag.oy)),
      }
      const clamped=constrainRect(spaceDrag.id, raw)
      setSpRects(prev=>({...prev,[spaceDrag.id]:clamped}))
    } else {
      const dx=ft.x-spaceDrag.sx, dy=ft.y-spaceDrag.sy
      const raw=applyResize(spaceDrag.handle, spaceDrag.sr, dx, dy)
      const clamped=constrainRect(spaceDrag.id, raw)
      setSpRects(prev=>({...prev,[spaceDrag.id]:clamped}))
    }
  }

  function onSpaceSvgUp() {
    if(!spaceDrag) return
    // If pool water moved/resized, cascade constraint to all pool decks
    const space=spaces.find(s=>s.id===spaceDrag.id)
    if(space?.type==="Swimming Pool (Water Surface)") {
      const pw=spRects[spaceDrag.id]
      setSpRects(prev => {
        const next={...prev}
        for(const s of spaces)
          if(s.type==="Pool Deck" && next[s.id])
            next[s.id]=clampPoolDeck(next[s.id], pw)
        return next
      })
    }
    onSpaceRectsChange(spRects)
    setSpaceDrag(null)
  }

  function resetSpaces() {
    const f=buildDefaultSpaceRects(spaces)
    setSpRects(f); onSpaceRectsChange(f)
  }

  // ── Render helpers ───────────────────────────────────────────────────────────
  const px = (ft:number) => ft*PX

  // Render spaces in this order: pool deck → others → pool water
  const spaceRenderOrder = useMemo(()=>[
    ...spaces.filter(s=>s.type==="Pool Deck"),
    ...spaces.filter(s=>s.type!=="Pool Deck" && s.type!=="Swimming Pool (Water Surface)"),
    ...spaces.filter(s=>s.type==="Swimming Pool (Water Surface)"),
  ],[spaces])

  // Handles for selected space
  function renderHandles(id:string) {
    const r=spRects[id]; if(!r) return null
    const pts: Array<{h:ResizeHandle; cx:number; cy:number}> = [
      {h:"nw",cx:px(r.x),             cy:px(r.y)},
      {h:"n", cx:px(r.x+r.w/2),       cy:px(r.y)},
      {h:"ne",cx:px(r.x+r.w),         cy:px(r.y)},
      {h:"e", cx:px(r.x+r.w),         cy:px(r.y+r.h/2)},
      {h:"se",cx:px(r.x+r.w),         cy:px(r.y+r.h)},
      {h:"s", cx:px(r.x+r.w/2),       cy:px(r.y+r.h)},
      {h:"sw",cx:px(r.x),             cy:px(r.y+r.h)},
      {h:"w", cx:px(r.x),             cy:px(r.y+r.h/2)},
    ]
    const HPXH = 5  // half handle size
    return pts.map(({h,cx,cy})=>(
      <rect
        key={h}
        x={cx-HPXH} y={cy-HPXH} width={HPXH*2} height={HPXH*2}
        fill="white" stroke="#374151" strokeWidth={1.5} rx={1}
        style={{cursor:HANDLE_CURSORS[h]}}
        onPointerDown={(e)=>onHandleDown(e,id,h)}
      />
    ))
  }

  const netSF = totalReqSF - overlapSF

  // ── Grid pattern shared ──────────────────────────────────────────────────────
  const GridDefs = () => (
    <defs>
      <pattern id="sp-grid" width={PX} height={PX} patternUnits="userSpaceOnUse">
        <path d={`M ${PX} 0 L 0 0 0 ${PX}`} fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
      </pattern>
      <pattern id="sp-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="7" stroke="#F59E0B" strokeWidth="3" strokeOpacity="0.45"/>
      </pattern>
    </defs>
  )

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── Equipment layout canvas ─────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Equipment Layout</h3>
            <p className="text-xs text-muted-foreground">
              Drag to arrange · overlapping clearance zones are deducted from net SF
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetEquip} className="gap-1.5 text-xs">
            <RotateCcw className="h-3 w-3"/>Reset
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-white dark:bg-zinc-950">
          <svg ref={eqSvgRef} width={px(CW)} height={px(EH)}
            className="block select-none"
            onPointerMove={onEqSvgMove} onPointerUp={onEqSvgUp} onPointerLeave={onEqSvgUp}>
            <GridDefs/>
            <rect width={px(CW)} height={px(EH)} fill="white"/>
            <rect width={px(CW)} height={px(EH)} fill="url(#sp-grid)"/>

            {/* Overlap highlights */}
            {eqInstances.flatMap(({key:kA,fw:fwA,border:bA},ai)=>
              eqInstances.slice(ai+1).map(({key:kB,fw:fwB,border:bB})=>{
                const pA=eqPos[kA], pB=eqPos[kB]; if(!pA||!pB) return null
                const sA=fwA+2*bA, sB=fwB+2*bB
                const ox=Math.max(0,Math.min(pA.x-bA+sA,pB.x-bB+sB)-Math.max(pA.x-bA,pB.x-bB))
                const oy=Math.max(0,Math.min(pA.y-bA+sA,pB.y-bB+sB)-Math.max(pA.y-bA,pB.y-bB))
                if(ox<=0||oy<=0) return null
                return(
                  <rect key={`ov-${kA}-${kB}`}
                    x={px(Math.max(pA.x-bA,pB.x-bB))} y={px(Math.max(pA.y-bA,pB.y-bB))}
                    width={px(ox)} height={px(oy)}
                    fill="url(#sp-hatch)" pointerEvents="none"/>
                )
              })
            )}

            {/* Equipment items */}
            {eqInstances.map(({key,fw,border,color,label,item})=>{
              const p=eqPos[key]; if(!p) return null
              const fpx=px(fw), isDrag=eqDrag?.key===key
              const fs=Math.max(8,Math.min(12,fpx/4))
              return(
                <g key={key} onPointerDown={e=>onEqItemDown(e,key)}
                  style={{cursor:isDrag?"grabbing":"grab"}}>
                  <rect x={px(p.x-border)} y={px(p.y-border)}
                    width={px(fw+2*border)} height={px(fw+2*border)}
                    fill={color} fillOpacity={0.07} stroke={color}
                    strokeWidth={1} strokeDasharray="5 3" rx={2}/>
                  <rect x={px(p.x)} y={px(p.y)} width={fpx} height={fpx}
                    fill={color} fillOpacity={isDrag?0.55:0.22}
                    stroke={color} strokeWidth={1.5} rx={2}/>
                  <text x={px(p.x)+fpx/2} y={px(p.y)+fpx/2-fs*0.7}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={fs} fill={color} fontWeight="600" pointerEvents="none">
                    {label}
                  </text>
                  <text x={px(p.x)+fpx/2} y={px(p.y)+fpx/2+fs*0.8}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.max(7,fs-2)} fill={color} opacity={0.75}
                    pointerEvents="none">
                    {item.footprint+item.accessSpace} SF
                  </text>
                </g>
              )
            })}

            {/* Scale indicator */}
            <g transform={`translate(${px(1)},${px(EH)-20})`}>
              <rect width={PX} height={4} fill="#9CA3AF"/>
              <text x={PX/2} y={14} textAnchor="middle" fontSize={8} fill="#9CA3AF">1 ft</text>
            </g>
          </svg>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            Required: <span className="font-semibold text-foreground">{totalReqSF.toFixed(1)} SF</span>
          </span>
          {overlapSF>0.5&&(
            <span className="text-muted-foreground">
              Clearance overlap: <span className="font-semibold text-amber-600 dark:text-amber-400">−{overlapSF.toFixed(1)} SF</span>
            </span>
          )}
          <span className="text-muted-foreground">
            Net: <span className="font-semibold text-foreground">{netSF.toFixed(1)} SF</span>
          </span>
        </div>
      </div>

      {/* ── Amenity space canvas ────────────────────────────────────────────── */}
      {spaces.length>0&&(
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Amenity Spaces</h3>
              <p className="text-xs text-muted-foreground">
                Click to select · drag to move · drag handles to resize ·
                pool deck stays ≥3 ft from water edge
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={resetSpaces} className="gap-1.5 text-xs">
              <RotateCcw className="h-3 w-3"/>Reset
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-white dark:bg-zinc-950">
            <svg ref={spaceSvgRef} width={px(CW)} height={px(SH)}
              className="block select-none"
              onPointerDown={onSpaceSvgDown}
              onPointerMove={onSpaceSvgMove}
              onPointerUp={onSpaceSvgUp}
              onPointerLeave={onSpaceSvgUp}>
              <defs>
                <pattern id="sp-grid2" width={PX} height={PX} patternUnits="userSpaceOnUse">
                  <path d={`M ${PX} 0 L 0 0 0 ${PX}`} fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width={px(CW)} height={px(SH)} fill="white"/>
              <rect width={px(CW)} height={px(SH)} fill="url(#sp-grid2)"/>

              {/* Spaces in render order: deck → others → pool water */}
              {spaceRenderOrder.map(space=>{
                const r=spRects[space.id]; if(!r) return null
                const colors=SPACE_COLORS[space.type]??{fill:"#F3F4F6",stroke:"#9CA3AF"}
                const isSelected=selectedId===space.id
                const isDragging=spaceDrag?.id===space.id
                const fs=Math.max(8,Math.min(12,px(r.w)/8))
                return(
                  <g key={space.id}
                    onPointerDown={e=>onSpaceDown(e,space.id)}
                    style={{cursor:isDragging?"grabbing":"grab"}}>
                    <rect
                      x={px(r.x)} y={px(r.y)} width={px(r.w)} height={px(r.h)}
                      fill={colors.fill}
                      fillOpacity={isDragging?0.85:1}
                      stroke={isSelected?colors.stroke:"#9CA3AF"}
                      strokeWidth={isSelected?2:1}
                      rx={2}/>
                    {px(r.w)>50&&(
                      <>
                        <text x={px(r.x)+px(r.w)/2} y={px(r.y)+px(r.h)/2-fs*0.7}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={fs} fill={colors.stroke} fontWeight="600"
                          pointerEvents="none">
                          {space.name}
                        </text>
                        <text x={px(r.x)+px(r.w)/2} y={px(r.y)+px(r.h)/2+fs*0.7}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={Math.max(7,fs-1.5)} fill={colors.stroke} opacity={0.8}
                          pointerEvents="none">
                          {space.squareFeet.toLocaleString()} SF
                        </text>
                      </>
                    )}
                  </g>
                )
              })}

              {/* Handles for selected space (rendered above all spaces) */}
              {selectedId&&renderHandles(selectedId)}

              {/* Scale indicator */}
              <g transform={`translate(${px(1)},${px(SH)-20})`}>
                <rect width={PX} height={4} fill="#9CA3AF"/>
                <text x={PX/2} y={14} textAnchor="middle" fontSize={8} fill="#9CA3AF">1 ft</text>
              </g>
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}
