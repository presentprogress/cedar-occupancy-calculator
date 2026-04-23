"use client"

import type { SpaceArea, SpaceLayout } from "@/lib/types"
import { rectsOverlap } from "@/lib/types"

const SETBACK = 3
const DECK_FACTOR = 15
const WATER_FACTOR = 50

function isWater(type: string) {
  return type === "Swimming Pool (Water Surface)" ||
         type === "Spa/Hot Tub (Water Surface)" ||
         type === "Cold Plunge (Water Surface)"
}

interface SpaceResult extends SpaceArea {
  loadFactor: number
  occupancy: number
  outsideEnclosure?: boolean
}

interface FlowChainProps {
  spaceResults: SpaceResult[]
  spaceLayouts: Record<string, SpaceLayout>
  totalOccupancy: number
}

// Group water spaces that overlap each other (transitive)
function groupWaterSpaces(results: SpaceResult[], layouts: Record<string, SpaceLayout>) {
  const water = results.filter(s => isWater(s.type))
  const grouped: SpaceResult[][] = []
  const seen = new Set<string>()

  for (const s of water) {
    if (seen.has(s.id)) continue
    const group = [s]
    seen.add(s.id)
    for (const other of water) {
      if (seen.has(other.id)) continue
      const la = layouts[s.id], lb = layouts[other.id]
      if (la && lb && rectsOverlap(la, lb)) { group.push(other); seen.add(other.id) }
    }
    grouped.push(group)
  }
  return grouped
}

// Inclusion-exclusion union area + bounding box for a set of rects
function unionInfo(ls: SpaceLayout[]) {
  const x0 = Math.min(...ls.map(l => l.x))
  const y0 = Math.min(...ls.map(l => l.y))
  const x1 = Math.max(...ls.map(l => l.x + l.w))
  const y1 = Math.max(...ls.map(l => l.y + l.h))
  let area = ls.reduce((s, l) => s + l.w * l.h, 0)
  for (let i = 0; i < ls.length; i++) {
    for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i], b = ls[j]
      const iw = Math.max(0, Math.min(a.x+a.w, b.x+b.w) - Math.max(a.x, b.x))
      const ih = Math.max(0, Math.min(a.y+a.h, b.y+b.h) - Math.max(a.y, b.y))
      area -= iw * ih
    }
  }
  return { area: Math.round(area), bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
}

export function FlowChain({ spaceResults, spaceLayouts, totalOccupancy }: FlowChainProps) {
  const waterGroups = groupWaterSpaces(spaceResults, spaceLayouts)
  const waterIds = new Set(spaceResults.filter(s => isWater(s.type)).map(s => s.id))
  const nonWater = spaceResults.filter(s => !isWater(s.type))

  // Build rows
  type Row =
    | { kind: "space"; space: SpaceResult }
    | { kind: "water-group"; group: SpaceResult[]; sf: number; occ: number }
    | { kind: "auto-deck"; label: string; sf: number; occ: number }

  const rows: Row[] = []

  // Water groups first
  for (const group of waterGroups) {
    const ls = group.map(s => spaceLayouts[s.id]).filter(Boolean)
    const { area } = ls.length ? unionInfo(ls) : { area: group.reduce((s,g) => s + g.squareFeet, 0) }
    const occ = group.some(s => s.excludeFromOccupancy) ? 0 : Math.ceil(area / WATER_FACTOR)
    rows.push({ kind: "water-group", group, sf: area, occ })

    // Auto pool deck (min.) — union of expanded rects minus water union (no double-count)
    if (ls.length) {
      const expanded = ls.map(l => ({ x: l.x - SETBACK, y: l.y - SETBACK, w: l.w + 2*SETBACK, h: l.h + 2*SETBACK }))
      const deckSF = Math.max(0, Math.round(unionInfo(expanded).area - area))
      const deckOcc = Math.ceil(deckSF / DECK_FACTOR)
      const label = group.length > 1
        ? `Pool Deck (Min.) — ${group.map(s => s.name).join(" + ")}`
        : `Pool Deck (Min.) — ${group[0].name}`
      rows.push({ kind: "auto-deck", label, sf: deckSF, occ: deckOcc })
    }
  }

  // Non-water spaces
  for (const space of nonWater) {
    rows.push({ kind: "space", space })
  }

  return (
    <section>
      <div className="overflow-hidden rounded-xl border border-border/60">
        {/* Header row */}
        <div className="grid grid-cols-[1fr,72px,80px,36px] items-center gap-x-2 border-b border-border/60 bg-muted/20 px-3 py-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Space</span>
          <span className="text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground">SF</span>
          <span className="text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground">÷ Load</span>
          <span className="text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Occ</span>
        </div>

        <div className="divide-y divide-border/30">
          {rows.map((row, i) => {
            if (row.kind === "water-group") {
              const { group, sf, occ } = row
              const excluded = group.every(s => s.excludeFromOccupancy)
              const outside = group.every(s => s.outsideEnclosure)
              const names = group.length > 1
                ? group.map(s => s.name).join(" + ")
                : group[0].name
              return (
                <div key={`wg-${i}`}
                  className={`grid grid-cols-[1fr,72px,80px,36px] items-center gap-x-2 px-3 py-1
                    ${excluded || outside ? "opacity-45" : ""}`}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span className="truncate text-xs font-medium">{names}</span>
                    {group.length > 1 && <span className="shrink-0 rounded font-mono text-[8px] text-blue-500/70">merged</span>}
                    {excluded && <span className="shrink-0 font-mono text-[8px] text-destructive/70">excl</span>}
                    {outside && <span className="shrink-0 font-mono text-[8px] text-muted-foreground">outside</span>}
                  </div>
                  <span className="text-right font-mono text-xs tabular-nums">{sf.toLocaleString()}</span>
                  <span className="text-right font-mono text-[10px] text-muted-foreground">÷ {WATER_FACTOR} SF/p</span>
                  <span className={`text-right font-bold text-xs tabular-nums ${excluded || outside ? "text-muted-foreground" : "text-amber-500"}`}>{excluded || outside ? 0 : occ}</span>
                </div>
              )
            }

            if (row.kind === "auto-deck") {
              const { label, sf, occ } = row
              return (
                <div key={`deck-${i}`}
                  className="grid grid-cols-[1fr,72px,80px,36px] items-center gap-x-2 px-3 py-1 bg-amber-500/5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/70" />
                    <span className="truncate text-xs font-medium text-amber-600 dark:text-amber-400">{label}</span>
                    <span className="shrink-0 rounded font-mono text-[8px] text-amber-500/60">auto</span>
                  </div>
                  <span className="text-right font-mono text-xs tabular-nums">{sf.toLocaleString()}</span>
                  <span className="text-right font-mono text-[10px] text-muted-foreground">÷ {DECK_FACTOR} SF/p</span>
                  <span className="text-right font-bold text-xs tabular-nums text-amber-500">{occ}</span>
                </div>
              )
            }

            // Normal space row
            const { space } = row
            const excluded = space.excludeFromOccupancy ?? false
            const outside = space.outsideEnclosure ?? false
            const dim = excluded || outside || !space.isConditioned
            return (
              <div key={space.id}
                className={`grid grid-cols-[1fr,72px,80px,36px] items-center gap-x-2 px-3 py-1 ${dim ? "opacity-45" : ""}`}>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${space.isConditioned && !excluded ? "bg-cyan-400" : "bg-muted-foreground"}`} />
                  <span className={`truncate text-xs font-medium ${excluded ? "line-through" : ""}`}>{space.name}</span>
                  {!space.isConditioned && <span className="shrink-0 font-mono text-[8px] text-muted-foreground">uncond</span>}
                  {excluded && <span className="shrink-0 font-mono text-[8px] text-destructive/70">excl</span>}
                  {outside && <span className="shrink-0 font-mono text-[8px] text-muted-foreground">outside</span>}
                </div>
                <span className="text-right font-mono text-xs tabular-nums">{space.squareFeet.toLocaleString()}</span>
                <span className="text-right font-mono text-[10px] text-muted-foreground">÷ {space.loadFactor} SF/p</span>
                <span className={`text-right font-bold text-xs tabular-nums ${!dim ? "text-amber-500" : "text-muted-foreground"}`}>
                  {dim ? 0 : space.occupancy}
                </span>
              </div>
            )
          })}

          {/* Total */}
          <div className="grid grid-cols-[1fr,72px,80px,36px] items-center gap-x-2 border-t border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
            <span className="col-span-3 text-xs font-semibold">Total Occupant Load</span>
            <span className="text-right font-black text-base tabular-nums text-amber-500">{totalOccupancy}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
