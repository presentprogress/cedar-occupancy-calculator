"use client"

import { useMemo, useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react"
import { PersistencePanel } from "@/components/persistence-panel"
import { VersionCompare } from "@/components/version-compare"
import { SpacePlanner } from "@/components/space-planner"
import { HeroMetrics } from "@/components/hero-metrics"
import { FlowChain } from "@/components/flow-chain"
import { SpaceEditor } from "@/components/space-editor"
import { EquipmentEditor } from "@/components/equipment-editor"
import { useUndoableState } from "@/hooks/use-undoable-state"
import { useAutoSnapshot } from "@/hooks/use-auto-snapshot"
import {
  IBC_LOAD_FACTORS,
  type SpaceType,
  type SpaceArea,
  type EquipmentItem,
  type AppState,
  getWCRequirements,
  getLavatoryCount,
} from "@/lib/types"

const defaultSpaces: SpaceArea[] = [
  { id: "1", name: "Main Pool",     type: "Swimming Pool (Water Surface)", squareFeet: 800, isConditioned: true },
  { id: "2", name: "Pool Deck",     type: "Pool Deck",                     squareFeet: 600, isConditioned: true },
  { id: "3", name: "Fitness Area",  type: "Exercise Room (Equipment)",     squareFeet: 500, isConditioned: true },
  { id: "4", name: "Sauna",         type: "Sauna/Steam Room",              squareFeet: 120, isConditioned: false },
  { id: "5", name: "Cold Plunge",   type: "Cold Plunge (Water Surface)",   squareFeet: 48,  isConditioned: true },
  { id: "6", name: "Locker Room",   type: "Locker Room",                   squareFeet: 400, isConditioned: true },
]

const defaultEquipment: EquipmentItem[] = [
  { id: "1", name: "Treadmill",       footprint: 20, accessSpace: 35, quantity: 2 },
  { id: "2", name: "Elliptical",      footprint: 18, accessSpace: 30, quantity: 2 },
  { id: "3", name: "Stationary Bike", footprint: 12, accessSpace: 20, quantity: 2 },
  { id: "4", name: "Weight Bench",    footprint: 15, accessSpace: 40, quantity: 1 },
  { id: "5", name: "Cable Machine",   footprint: 25, accessSpace: 60, quantity: 1 },
]

const initialState: AppState = {
  spaces: defaultSpaces,
  equipment: defaultEquipment,
  unconditionedLimit: 500,
  maxOccupants: undefined,
  farCap: undefined,
}

export default function OccupancyCalculator() {
  const { state: appState, setState: setAppState, undo } = useUndoableState<AppState>(initialState)
  const [compareOpen, setCompareOpen] = useState(false)
  const [ibcOpen, setIbcOpen] = useState(false)

  useAutoSnapshot(appState)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [undo])

  const { spaces, equipment, unconditionedLimit, maxOccupants, farCap } = appState

  const addSpace = () =>
    setAppState((prev) => ({
      ...prev,
      spaces: [...prev.spaces, {
        id: crypto.randomUUID(),
        name: "New Space",
        type: "Pool Deck" as SpaceType,
        squareFeet: 0,
        isConditioned: true,
      }],
    }))

  const updateSpace = (id: string, updates: Partial<SpaceArea>) =>
    setAppState((prev) => ({
      ...prev,
      spaces: prev.spaces.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }))

  const removeSpace = (id: string) =>
    setAppState((prev) => ({ ...prev, spaces: prev.spaces.filter((s) => s.id !== id) }))

  const addEquipment = () =>
    setAppState((prev) => ({
      ...prev,
      equipment: [...prev.equipment, {
        id: crypto.randomUUID(),
        name: "New Equipment",
        footprint: 15,
        accessSpace: 30,
        sharedClearance: 0,
        quantity: 1,
      }],
    }))

  const updateEquipment = (id: string, updates: Partial<EquipmentItem>) =>
    setAppState((prev) => ({
      ...prev,
      equipment: prev.equipment.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }))

  const removeEquipment = (id: string) =>
    setAppState((prev) => ({ ...prev, equipment: prev.equipment.filter((e) => e.id !== id) }))

  const calc = useMemo(() => {
    const spaceResults = spaces.map((s) => ({
      ...s,
      loadFactor: IBC_LOAD_FACTORS[s.type],
      occupancy: Math.ceil(s.squareFeet / IBC_LOAD_FACTORS[s.type]),
    }))

    const equipmentResults = equipment.map((item) => {
      const shared = item.sharedClearance ?? 0
      const fpUnit = item.footprint + item.accessSpace
      const savings = shared * Math.max(0, item.quantity - 1)
      return { ...item, totalSpace: fpUnit * item.quantity - savings }
    })

    const totalEquipmentSpace = equipmentResults.reduce((s, e) => s + e.totalSpace, 0)
    const conditionedSF = spaces.filter((s) => s.isConditioned).reduce((s, sp) => s + sp.squareFeet, 0)
    const unconditionedSF = spaces.filter((s) => !s.isConditioned).reduce((s, sp) => s + sp.squareFeet, 0)
    const totalOccupancy = spaceResults.reduce((s, sp) => s + sp.occupancy, 0)
    const gymTypes = ["Exercise Room (Equipment)", "Exercise Room (Concentrated)"]
    const totalGymSF = spaces.filter((s) => gymTypes.includes(s.type)).reduce((s, sp) => s + sp.squareFeet, 0)

    return {
      spaceResults,
      totalEquipmentSpace,
      conditionedSF,
      unconditionedSF,
      totalOccupancy,
      totalGymSF,
      equipmentFitsInGym: totalGymSF >= totalEquipmentSpace,
      unconditionedOverLimit: unconditionedSF > unconditionedLimit,
      farOverLimit: farCap !== undefined && conditionedSF > farCap,
      remainingOccupantLoad: maxOccupants !== undefined ? maxOccupants - totalOccupancy : undefined,
      wc: getWCRequirements(totalOccupancy),
      lavatories: getLavatoryCount(totalOccupancy),
    }
  }, [spaces, equipment, unconditionedLimit, maxOccupants, farCap])

  return (
    <main className="min-h-screen bg-background text-foreground">

      {/* Sticky header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-[1600px] px-4 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="shrink-0">
            <h1 className="text-sm font-semibold">Cedar Occupancy Calculator</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              IBC Table 1004.5 · Amenity Spaces
            </p>
          </div>
          <PersistencePanel
            currentState={appState}
            onLoad={(state) => setAppState(state, { skipHistory: true })}
            onCompare={() => setCompareOpen(true)}
          />
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 lg:px-8 py-8 space-y-6">

        {/* Hero */}
        <HeroMetrics
          totalOccupancy={calc.totalOccupancy}
          conditionedSF={calc.conditionedSF}
          unconditionedSF={calc.unconditionedSF}
          unconditionedLimit={unconditionedLimit}
          unconditionedOverLimit={calc.unconditionedOverLimit}
          maxOccupants={maxOccupants}
          farCap={farCap}
          farOverLimit={calc.farOverLimit}
          remainingOccupantLoad={calc.remainingOccupantLoad}
        />

        {/* Single canvas */}
        <section className="overflow-hidden rounded-xl border border-border/60">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Amenity Space Plan
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Proportional by SF · equipment shown within gym zone · amber = occupant load
              </p>
            </div>
            {calc.totalGymSF > 0 && (
              <span className={`rounded-md border px-2 py-1 font-mono text-xs ${
                calc.equipmentFitsInGym
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-destructive/20 bg-destructive/10 text-destructive"
              }`}>
                {calc.totalEquipmentSpace} SF equip{" "}
                {calc.equipmentFitsInGym ? "✓ fits" : "✗ overflow"}
              </span>
            )}
          </div>
          <SpacePlanner equipment={equipment} spaces={spaces} />
        </section>

        {/* Flow chain → restrooms */}
        <FlowChain
          spaceResults={calc.spaceResults}
          totalOccupancy={calc.totalOccupancy}
          wc={calc.wc}
          lavatories={calc.lavatories}
        />

        {/* Editors */}
        <section className="grid grid-cols-2 gap-4">
          <SpaceEditor
            spaces={spaces}
            onAdd={addSpace}
            onUpdate={updateSpace}
            onRemove={removeSpace}
          />
          <EquipmentEditor
            equipment={equipment}
            totalEquipmentSpace={calc.totalEquipmentSpace}
            totalGymSF={calc.totalGymSF}
            equipmentFitsInGym={calc.equipmentFitsInGym}
            onAdd={addEquipment}
            onUpdate={updateEquipment}
            onRemove={removeEquipment}
          />
        </section>

        {/* Settings */}
        <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/60 px-4 py-3">
          <p className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Settings
          </p>
          <div className="flex items-center gap-2">
            <Label htmlFor="max-occ" className="whitespace-nowrap text-xs text-muted-foreground">Max Occupants</Label>
            <Input
              id="max-occ" type="number"
              value={maxOccupants ?? ""} placeholder="—"
              onChange={(e) => setAppState((prev) => ({
                ...prev, maxOccupants: e.target.value ? Number(e.target.value) : undefined,
              }))}
              className="h-7 w-20 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="far-cap" className="whitespace-nowrap text-xs text-muted-foreground">FAR Cap (SF)</Label>
            <Input
              id="far-cap" type="number"
              value={farCap ?? ""} placeholder="—"
              onChange={(e) => setAppState((prev) => ({
                ...prev, farCap: e.target.value ? Number(e.target.value) : undefined,
              }))}
              className="h-7 w-24 text-sm"
            />
            {calc.farOverLimit && (
              <Badge variant="destructive" className="h-6 gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                +{(calc.conditionedSF - farCap!).toLocaleString()} SF
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="uncond-limit" className="whitespace-nowrap text-xs text-muted-foreground">Uncond. Limit (SF)</Label>
            <Input
              id="uncond-limit" type="number"
              value={unconditionedLimit}
              onChange={(e) => setAppState((prev) => ({
                ...prev, unconditionedLimit: Number(e.target.value),
              }))}
              className="h-7 w-24 text-sm"
            />
            {calc.unconditionedOverLimit && (
              <Badge variant="destructive" className="h-6 gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                +{calc.unconditionedSF - unconditionedLimit} SF
              </Badge>
            )}
          </div>
        </section>

        {/* IBC Reference (collapsible) */}
        <section className="overflow-hidden rounded-xl border border-border/60">
          <button
            className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/30"
            onClick={() => setIbcOpen(!ibcOpen)}
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              IBC Table 1004.5 — Load Factor Reference
            </p>
            {ibcOpen
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {ibcOpen && (
            <div className="grid gap-2 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {Object.entries(IBC_LOAD_FACTORS).map(([type, factor]) => (
                <div key={type} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                  <span className="text-xs text-muted-foreground">{type}</span>
                  <Badge variant="outline" className="font-mono text-xs">{factor} SF/p</Badge>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      <VersionCompare open={compareOpen} onOpenChange={setCompareOpen} />
    </main>
  )
}
