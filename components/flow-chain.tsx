"use client"

import type { SpaceArea } from "@/lib/types"

interface SpaceResult extends SpaceArea {
  loadFactor: number
  occupancy: number
}

interface FlowChainProps {
  spaceResults: SpaceResult[]
  totalOccupancy: number
}

export function FlowChain({ spaceResults, totalOccupancy }: FlowChainProps) {
  return (
    <section>

      {/* ── Derivation table ── */}
      <div className="overflow-hidden rounded-xl border border-border/60">
        <div className="border-b border-border/60 px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            SF → Occupancy Derivation
          </p>
        </div>

        <div className="divide-y divide-border/40">
          {spaceResults.map((space) => (
            <div
              key={space.id}
              className={`grid items-center gap-2 px-4 py-2.5 text-sm
                grid-cols-[1fr,76px,88px,14px,72px]
                ${!space.isConditioned ? "opacity-55" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${space.isConditioned ? "bg-cyan-400" : "bg-muted-foreground"}`} />
                <span className="truncate font-medium">{space.name}</span>
                {!space.isConditioned && (
                  <span className="shrink-0 font-mono text-[9px] uppercase text-muted-foreground">uncond</span>
                )}
              </div>
              <span className="text-right font-mono text-sm tabular-nums">
                {space.squareFeet.toLocaleString()} SF
              </span>
              <span className="text-right font-mono text-xs text-muted-foreground">
                ÷ {space.loadFactor} SF/p
              </span>
              <span className="text-center text-xs text-muted-foreground">→</span>
              <div className="text-right">
                <span className="font-bold tabular-nums text-amber-400">{space.occupancy}</span>
                <span className="ml-1 text-xs text-muted-foreground">occ</span>
              </div>
            </div>
          ))}

          {/* Total row */}
          <div className="grid items-center gap-2 border-t border-amber-500/20 bg-amber-500/5 px-4 py-3
            grid-cols-[1fr,76px,88px,14px,72px]">
            <span className="col-span-3 font-semibold text-sm">Total Occupant Load</span>
            <span className="text-center text-xs text-muted-foreground">=</span>
            <span className="text-right font-black text-xl tabular-nums text-amber-400">
              {totalOccupancy}
            </span>
          </div>
        </div>
      </div>

    </section>
  )
}
