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
  farCap?: number
  unconditionedLimit?: number
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

// Inclusion-exclusion union area
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

const COLS = "grid-cols-[1fr,68px,74px,40px]"

export function FlowChain({ spaceResults, spaceLayouts, totalOccupancy, farCap, unconditionedLimit }: FlowChainProps) {
  const waterGroups = groupWaterSpaces(spaceResults, spaceLayouts)
  const nonWater = spaceResults.filter(s => !isWater(s.type))
  const hasManualPoolDeck = spaceResults.some(s => s.type === "Pool Deck")

  type Row =
    | { kind: "space"; space: SpaceResult }
    | { kind: "water-group"; group: SpaceResult[]; sf: number; occ: number }
    | { kind: "auto-deck"; sf: number; occ: number; infoOnly: boolean }

  const rows: Row[] = []

  for (const group of waterGroups) {
    const ls = group.map(s => spaceLayouts[s.id]).filter(Boolean)
    const { area } = ls.length ? unionInfo(ls) : { area: group.reduce((s,g) => s + g.squareFeet, 0) }
    const occ = group.some(s => s.excludeFromOccupancy) ? 0 : Math.ceil(area / WATER_FACTOR)
    rows.push({ kind: "water-group", group, sf: area, occ })

    if (ls.length) {
      const expanded = ls.map(l => ({ x: l.x - SETBACK, y: l.y - SETBACK, w: l.w + 2*SETBACK, h: l.h + 2*SETBACK }))
      const deckSF = Math.max(0, Math.round(unionInfo(expanded).area - area))
      const deckOcc = Math.ceil(deckSF / DECK_FACTOR)
      rows.push({ kind: "auto-deck", sf: deckSF, occ: deckOcc, infoOnly: hasManualPoolDeck })
    }
  }

  for (const space of nonWater) {
    rows.push({ kind: "space", space })
  }

  // Totals from spaceResults (consistent with main calc)
  const condTotalSF = spaceResults
    .filter(s => s.isConditioned && !s.outsideEnclosure)
    .reduce((a, s) => a + s.squareFeet, 0)
  const uncondTotalSF = spaceResults
    .filter(s => !s.isConditioned && !s.outsideEnclosure)
    .reduce((a, s) => a + s.squareFeet, 0)
  const farOver = farCap !== undefined && condTotalSF > farCap
  const uncondOver = unconditionedLimit !== undefined && uncondTotalSF > unconditionedLimit

  return (
    <section>
      <div className="overflow-hidden rounded-xl border border-border/60">
        {/* Panel header */}
        <div className="flex items-center border-b border-border/60 px-3 py-3">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Totals</p>
        </div>

        {/* Column headers */}
        <div className={`grid ${COLS} items-center gap-x-2 border-b border-border/60 bg-muted/20 px-3 py-1.5`}>
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Space</span>
          <span className="text-right font-mono text-xs uppercase tracking-widest text-muted-foreground">Cond SF</span>
          <span className="text-right font-mono text-xs uppercase tracking-widest text-muted-foreground">Uncond SF</span>
          <span className="text-right font-mono text-xs uppercase tracking-widest text-muted-foreground">Occ</span>
        </div>

        <div className="divide-y divide-border/30">
          {rows.map((row, i) => {
            if (row.kind === "water-group") {
              const { group, sf, occ } = row
              const excluded = group.every(s => s.excludeFromOccupancy)
              const outside = group.every(s => s.outsideEnclosure)
              const names = group.length > 1 ? group.map(s => s.name).join(" + ") : group[0].name
              const dim = excluded || outside
              return (
                <div key={`wg-${i}`}
                  className={`grid ${COLS} items-center gap-x-2 px-3 py-1.5 ${dim ? "opacity-45" : ""}`}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      <span className="truncate text-xs font-medium">{names}</span>
                      {group.length > 1 && <span className="shrink-0 rounded font-mono text-[10px] text-blue-500/70">merged</span>}
                      {excluded && <span className="shrink-0 font-mono text-[10px] text-destructive/70">excl</span>}
                      {outside && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">outside</span>}
                    </div>
                    <span className="pl-3 font-mono text-[10px] text-muted-foreground">÷ {WATER_FACTOR} SF/p</span>
                  </div>
                  <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">—</span>
                  <span className="text-right font-mono text-xs tabular-nums">{sf.toLocaleString()}</span>
                  <span className={`text-right font-bold text-xs tabular-nums ${dim ? "text-muted-foreground" : "text-amber-500"}`}>
                    {dim ? 0 : occ}
                  </span>
                </div>
              )
            }

            if (row.kind === "auto-deck") {
              const { sf, occ, infoOnly } = row
              return (
                <div key={`deck-${i}`}
                  className={`grid ${COLS} items-center gap-x-2 px-3 py-1.5 bg-amber-500/5 ${infoOnly ? "opacity-45" : ""}`}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/70" />
                      <span className="truncate text-xs font-medium text-amber-600 dark:text-amber-400">Pool Deck (Auto)</span>
                      {infoOnly
                        ? <span className="shrink-0 rounded font-mono text-[10px] text-muted-foreground">ref only</span>
                        : <span className="shrink-0 rounded font-mono text-[10px] text-amber-500/60">auto</span>}
                    </div>
                    {!infoOnly && <span className="pl-3 font-mono text-[10px] text-muted-foreground">÷ {DECK_FACTOR} SF/p</span>}
                  </div>
                  <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">—</span>
                  <span className="text-right font-mono text-xs tabular-nums">{sf.toLocaleString()}</span>
                  <span className={`text-right font-bold text-xs tabular-nums ${infoOnly ? "text-muted-foreground" : "text-amber-500"}`}>
                    {occ}
                  </span>
                </div>
              )
            }

            // Normal space row
            const { space } = row
            const excluded = space.excludeFromOccupancy ?? false
            const outside = space.outsideEnclosure ?? false
            const dim = excluded || outside
            const zeroOcc = excluded || outside
            return (
              <div key={space.id}
                className={`grid ${COLS} items-center gap-x-2 px-3 py-1.5 ${dim || !space.isConditioned ? "opacity-45" : ""}`}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${space.isConditioned && !excluded ? "bg-cyan-400" : "bg-muted-foreground"}`} />
                    <span className={`truncate text-xs font-medium ${excluded ? "line-through" : ""}`}>{space.name}</span>
                    {!space.isConditioned && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">uncond</span>}
                    {excluded && <span className="shrink-0 font-mono text-[10px] text-destructive/70">excl</span>}
                    {outside && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">outside</span>}
                  </div>
                  <span className="pl-3 font-mono text-[10px] text-muted-foreground">÷ {space.loadFactor} SF/p</span>
                </div>
                <span className="text-right font-mono text-xs tabular-nums">
                  {space.isConditioned ? space.squareFeet.toLocaleString() : <span className="text-muted-foreground">—</span>}
                </span>
                <span className="text-right font-mono text-xs tabular-nums">
                  {!space.isConditioned ? space.squareFeet.toLocaleString() : <span className="text-muted-foreground">—</span>}
                </span>
                <span className={`text-right font-bold text-xs tabular-nums ${!zeroOcc ? "text-amber-500" : "text-muted-foreground"}`}>
                  {zeroOcc ? 0 : space.occupancy}
                </span>
              </div>
            )
          })}

          {/* Totals footer */}
          <div className={`grid ${COLS} items-start gap-x-2 border-t border-amber-500/20 bg-amber-500/5 px-3 py-2`}>
            <span className="text-xs font-semibold">Total Occupant Load</span>
            <div className="text-right">
              <div className="font-mono text-xs tabular-nums font-semibold">{condTotalSF.toLocaleString()}</div>
              {farCap !== undefined && (
                <div className={`font-mono text-[10px] tabular-nums ${farOver ? "text-destructive" : "text-muted-foreground"}`}>
                  / {farCap.toLocaleString()} FAR
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="font-mono text-xs tabular-nums font-semibold">{uncondTotalSF.toLocaleString()}</div>
              {unconditionedLimit !== undefined && (
                <div className={`font-mono text-[10px] tabular-nums ${uncondOver ? "text-destructive" : "text-muted-foreground"}`}>
                  / {unconditionedLimit.toLocaleString()} lim
                </div>
              )}
            </div>
            <span className="text-right font-black text-base tabular-nums text-amber-500">{totalOccupancy}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
