"use client"

interface HeroMetricsProps {
  totalOccupancy: number
  totalSF: number
  conditionedSF: number
  unconditionedSF: number
  unconditionedLimit: number
  unconditionedOverLimit: boolean
  maxOccupants?: number
  farCap?: number
  farOverLimit: boolean
  remainingOccupantLoad?: number
  className?: string
}

export function HeroMetrics({
  totalOccupancy,
  totalSF,
  conditionedSF,
  unconditionedSF,
  unconditionedLimit,
  unconditionedOverLimit,
  maxOccupants,
  farCap,
  farOverLimit,
  remainingOccupantLoad,
  className = "",
}: HeroMetricsProps) {
  const overOccupancy = remainingOccupantLoad !== undefined && remainingOccupantLoad < 0
  const occFrac = maxOccupants ? Math.min(1, totalOccupancy / maxOccupants) : null
  const condFrac = farCap ? Math.min(1, conditionedSF / farCap) : null

  return (
    <section className={`grid grid-cols-2 gap-4 ${className}`}>

      {/* ── Occupant Load ── */}
      <div className={`rounded-xl border p-4 ${overOccupancy
        ? "border-destructive/50 bg-destructive/5"
        : "border-amber-500/25 bg-amber-500/5"}`}>
        <p className="mb-1 font-mono text-xs uppercase tracking-widest text-amber-500/60">
          IBC Occupant Load
        </p>
        <div className="flex items-end gap-3">
          <span className={`font-black tabular-nums leading-none ${overOccupancy ? "text-5xl text-destructive" : "text-5xl text-amber-400"}`}>
            {totalOccupancy}
          </span>
          <span className="mb-1 text-sm text-muted-foreground">persons</span>
        </div>

        {maxOccupants !== undefined ? (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Cap: {maxOccupants}</span>
              <span className={overOccupancy ? "font-semibold text-destructive" : "font-semibold text-emerald-400"}>
                {overOccupancy
                  ? `${Math.abs(remainingOccupantLoad!)} over`
                  : `${remainingOccupantLoad} remaining`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${occFrac! > 1 ? "bg-destructive" : occFrac! > 0.85 ? "bg-amber-500" : "bg-emerald-400"}`}
                style={{ width: `${Math.min(100, occFrac! * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">Set a cap in Settings to track headroom</p>
        )}
      </div>

      {/* ── Total / Conditioned SF ── */}
      <div className={`rounded-xl border p-4 ${farOverLimit
        ? "border-destructive/50 bg-destructive/5"
        : "border-cyan-500/25 bg-cyan-500/5"}`}>
        <p className="mb-1 font-mono text-xs uppercase tracking-widest text-cyan-500/60">
          Total Area
        </p>
        <div className="flex items-end gap-3">
          <span className={`font-black tabular-nums leading-none ${farOverLimit ? "text-5xl text-destructive" : "text-5xl text-cyan-400"}`}>
            {totalSF.toLocaleString()}
          </span>
          <span className="mb-1 text-sm text-muted-foreground">sq ft</span>
        </div>

        {farCap !== undefined ? (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">FAR cap: {farCap.toLocaleString()} SF</span>
              <span className={farOverLimit ? "font-semibold text-destructive" : "font-semibold text-emerald-400"}>
                {farOverLimit
                  ? `${(conditionedSF - farCap).toLocaleString()} over`
                  : `${(farCap - conditionedSF).toLocaleString()} remaining`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${condFrac! > 1 ? "bg-destructive" : condFrac! > 0.85 ? "bg-amber-500" : "bg-cyan-400"}`}
                style={{ width: `${Math.min(100, condFrac! * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Conditioned: </span>
              <span className="font-medium">{conditionedSF.toLocaleString()} SF</span>
            </div>
            <div>
              <span className="text-muted-foreground">Unconditioned: </span>
              <span className={unconditionedOverLimit ? "font-semibold text-destructive" : "font-medium"}>
                {unconditionedSF.toLocaleString()} SF
                {unconditionedOverLimit && <span className="ml-1 text-destructive"> (limit {unconditionedLimit.toLocaleString()})</span>}
              </span>
            </div>
          </div>
        )}
      </div>

    </section>
  )
}
