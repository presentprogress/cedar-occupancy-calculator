"use client"

import { AlertTriangle } from "lucide-react"

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

  return (
    <section className={`grid grid-cols-2 gap-4 ${className}`}>
      <MetricPanel
        eyebrow="IBC Occupant Load"
        secondary="IBC 1004.5"
        value={totalOccupancy.toLocaleString()}
        unit="persons"
        emphasize={!overOccupancy}
        warn={overOccupancy}
        rows={[
          maxOccupants !== undefined
            ? {
                label: "Cap",
                value: maxOccupants.toLocaleString(),
              }
            : null,
          maxOccupants !== undefined
            ? {
                label: overOccupancy ? "Over" : "Remaining",
                value: overOccupancy
                  ? `+${Math.abs(remainingOccupantLoad!).toLocaleString()}`
                  : remainingOccupantLoad!.toLocaleString(),
                warn: overOccupancy,
              }
            : { label: "Cap", value: "—", muted: true },
        ]}
      />

      <MetricPanel
        eyebrow="Total Area"
        secondary="sq ft"
        value={totalSF.toLocaleString()}
        unit="sf"
        emphasize={!farOverLimit}
        warn={farOverLimit}
        rows={[
          {
            label: "Conditioned",
            value: `${conditionedSF.toLocaleString()} sf`,
            warn: farOverLimit,
          },
          {
            label: "Unconditioned",
            value: `${unconditionedSF.toLocaleString()} sf`,
            warn: unconditionedOverLimit,
            hint:
              farCap !== undefined
                ? undefined
                : unconditionedOverLimit
                ? `limit ${unconditionedLimit.toLocaleString()}`
                : undefined,
          },
          farCap !== undefined
            ? {
                label: "FAR cap",
                value: `${farCap.toLocaleString()} sf`,
                hint: farOverLimit
                  ? `+${(conditionedSF - farCap).toLocaleString()} over`
                  : `${(farCap - conditionedSF).toLocaleString()} left`,
                warn: farOverLimit,
              }
            : null,
        ]}
      />
    </section>
  )
}

interface MetricRow {
  label: string
  value: string
  hint?: string
  warn?: boolean
  muted?: boolean
}

function MetricPanel({
  eyebrow,
  secondary,
  value,
  unit,
  emphasize,
  warn,
  rows,
}: {
  eyebrow: string
  secondary?: string
  value: string
  unit: string
  emphasize?: boolean
  warn?: boolean
  rows: (MetricRow | null)[]
}) {
  const visibleRows = rows.filter(Boolean) as MetricRow[]
  return (
    <div className="panel flex flex-col">
      <div className="panel-head">
        <span className="label-eyebrow">{eyebrow}</span>
        {secondary && <span className="label-eyebrow">{secondary}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-black tabular-nums leading-none text-5xl ${
              warn ? "text-destructive" : emphasize ? "text-primary" : "text-foreground"
            }`}
          >
            {value}
          </span>
          <span className="text-sm text-muted-foreground">{unit}</span>
          {warn && (
            <AlertTriangle className="ml-auto h-4 w-4 text-destructive" />
          )}
        </div>
        {visibleRows.length > 0 && (
          <dl className="mt-auto grid grid-cols-1 gap-1 border-t border-border pt-2 text-xs">
            {visibleRows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd
                  className={`font-mono tabular-nums ${
                    r.warn
                      ? "text-destructive"
                      : r.muted
                      ? "text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  {r.value}
                  {r.hint && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {r.hint}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}
