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
import { OccupancyChart } from "@/components/occupancy-chart"
import { ThemeToggle } from "@/components/theme-toggle"
import { useUndoableState } from "@/hooks/use-undoable-state"
import { useAutoSnapshot } from "@/hooks/use-auto-snapshot"
import {
  IBC_LOAD_FACTORS,
  isNonRoomType,
  rectsOverlap,
  type SpaceType,
  type SpaceArea,
  type EquipmentItem,
  type AppState,
  type SpaceLayout,
  getWCRequirements,
  getLavatoryCount,
} from "@/lib/types"

// ─── Defaults ─────────────────────────────────────────────────────────────────
const defaultSpaces: SpaceArea[] = [
  { id: "1", name: "Main Pool",    type: "Swimming Pool (Water Surface)", squareFeet: 800, isConditioned: false, impactsFAR: false, impactsOccupancy: true },
  { id: "2", name: "Pool Deck",    type: "Pool Deck",                     squareFeet: 600, isConditioned: false, impactsFAR: false, impactsOccupancy: true },
  { id: "3", name: "Fitness Area", type: "Exercise Room (Equipment)",     squareFeet: 500, isConditioned: true,  impactsFAR: true,  impactsOccupancy: true },
  { id: "4", name: "Sauna",        type: "Sauna/Steam Room",              squareFeet: 120, isConditioned: false, impactsFAR: true,  impactsOccupancy: true },
  { id: "5", name: "Cold Plunge",  type: "Cold Plunge (Water Surface)",   squareFeet:  48, isConditioned: false, impactsFAR: false, impactsOccupancy: true },
  { id: "6", name: "Locker Room",  type: "Locker Room",                   squareFeet: 400, isConditioned: true,  impactsFAR: true,  impactsOccupancy: true },
]

// Initial canvas positions (w × h = squareFeet for each)
const defaultLayouts: Record<string, SpaceLayout> = {
  "1": { x: 4,  y: 4,  w: 16, h: 50 },   // 800 SF
  "2": { x: 24, y: 4,  w: 20, h: 30 },   // 600 SF
  "3": { x: 4,  y: 58, w: 20, h: 25 },   // 500 SF
  "4": { x: 28, y: 58, w: 10, h: 12 },   // 120 SF
  "5": { x: 40, y: 58, w:  6, h:  8 },   //  48 SF
  "6": { x: 4,  y: 87, w: 20, h: 20 },   // 400 SF
}

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
  spaceLayouts: defaultLayouts,
  enclosure: { x: 1, y: 1, w: 54, h: 115 },
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OccupancyCalculator() {
  const { state: appState, setState: setAppState, undo } = useUndoableState<AppState>(initialState)
  const [compareOpen, setCompareOpen] = useState(false)
  const [ibcOpen, setIbcOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)

  useAutoSnapshot(appState)

  // Theme init from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("cedar-theme")
    if (stored === "dark") {
      setIsDark(true)
      document.documentElement.classList.add("dark")
    }
  }, [])

  // Sync ThemeToggle changes back to this state
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"))
    })
    obs.observe(document.documentElement, { attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])

  // Undo shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault(); undo()
      }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [undo])

  const { spaces, equipment, unconditionedLimit, maxOccupants, farCap, spaceLayouts, enclosure } = appState

  // ── Space mutations ──────────────────────────────────────────────────────────
  const addSpace = () => {
    const id = crypto.randomUUID()
    const defaultType = "Pool Deck" as SpaceType
    const nonRoom = isNonRoomType(defaultType)
    setAppState((prev) => ({
      ...prev,
      spaces: [{
        id, name: "New Space", type: defaultType,
        squareFeet: 100,
        isConditioned: !nonRoom,
        impactsFAR: !nonRoom,
        impactsOccupancy: true,
      }, ...prev.spaces],
      spaceLayouts: { ...prev.spaceLayouts, [id]: { x: 4, y: 4, w: 10, h: 10 } },
    }))
  }

  const duplicateSpace = (srcId: string) => {
    const src = spaces.find(s => s.id === srcId)
    const srcLayout = spaceLayouts[srcId]
    if (!src) return
    const id = crypto.randomUUID()
    setAppState((prev) => {
      const srcIndex = prev.spaces.findIndex(s => s.id === srcId)
      const newSpaces = [...prev.spaces]
      newSpaces.splice(srcIndex + 1, 0, { ...src, id, name: `${src.name} (copy)` })
      return {
        ...prev,
        spaces: newSpaces,
        spaceLayouts: {
          ...prev.spaceLayouts,
          [id]: srcLayout
            ? { ...srcLayout, x: srcLayout.x + 4, y: srcLayout.y + 4 }
            : { x: 4, y: 4, w: 10, h: 10 },
        },
      }
    })
  }

  const updateSpace = (id: string, updates: Partial<SpaceArea>) =>
    setAppState((prev) => ({
      ...prev,
      spaces: prev.spaces.map((s) => s.id === id ? { ...s, ...updates } : s),
    }))

  const removeSpace = (id: string) =>
    setAppState((prev) => {
      const { [id]: _, ...restLayouts } = prev.spaceLayouts
      return {
        ...prev,
        spaces: prev.spaces.filter((s) => s.id !== id),
        spaceLayouts: restLayouts,
      }
    })

  const handleEnclosureChange = (e: SpaceLayout) =>
    setAppState((prev) => ({ ...prev, enclosure: e }), { skipHistory: false })

  // Canvas resize → updates both layout and squareFeet
  const handleSpaceResize = (id: string, layout: SpaceLayout) =>
    setAppState((prev) => ({
      ...prev,
      spaceLayouts: { ...prev.spaceLayouts, [id]: layout },
      spaces: prev.spaces.map((s) =>
        s.id === id ? { ...s, squareFeet: Math.round(layout.w * layout.h) } : s
      ),
    }), { skipHistory: false })

  // ── Equipment mutations ──────────────────────────────────────────────────────
  const addEquipment = () =>
    setAppState((prev) => ({
      ...prev,
      equipment: [{
        id: crypto.randomUUID(), name: "New Equipment",
        footprint: 15, accessSpace: 30, sharedClearance: 0, quantity: 1,
      }, ...prev.equipment],
    }))

  const updateEquipment = (id: string, updates: Partial<EquipmentItem>) =>
    setAppState((prev) => ({
      ...prev,
      equipment: prev.equipment.map((e) => e.id === id ? { ...e, ...updates } : e),
    }))

  const removeEquipment = (id: string) =>
    setAppState((prev) => ({ ...prev, equipment: prev.equipment.filter((e) => e.id !== id) }))

  // ── Calculations ─────────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    // Inclusion-exclusion union area for a list of rectangles
    function rectUnionArea(ls: {x:number,y:number,w:number,h:number}[]) {
      let a = ls.reduce((s, l) => s + l.w * l.h, 0)
      for (let i = 0; i < ls.length; i++)
        for (let j = i+1; j < ls.length; j++) {
          const [p, q] = [ls[i], ls[j]]
          a -= Math.max(0, Math.min(p.x+p.w, q.x+q.w) - Math.max(p.x, q.x)) *
               Math.max(0, Math.min(p.y+p.h, q.y+q.h) - Math.max(p.y, q.y))
        }
      return a
    }

    const waterTypes = new Set(["Swimming Pool (Water Surface)", "Spa/Hot Tub (Water Surface)", "Cold Plunge (Water Surface)"])

    // Resolve impactsOccupancy with backward-compat for old excludeFromOccupancy field
    const impactsOcc = (s: SpaceArea) => s.impactsOccupancy ?? !(s.excludeFromOccupancy ?? false)

    const spaceResults = spaces.map((s) => {
      const layout = spaceLayouts[s.id]
      const inBounds = !enclosure || !layout || rectsOverlap(layout, enclosure)
      const active = inBounds && impactsOcc(s)
      return {
        ...s,
        loadFactor: IBC_LOAD_FACTORS[s.type],
        occupancy: active ? Math.ceil(s.squareFeet / IBC_LOAD_FACTORS[s.type]) : 0,
        outsideEnclosure: !inBounds,
      }
    })

    // Correct overlapping water surface occupancies to use union area (prevents double-counting)
    const activeWater = spaceResults.filter(s => waterTypes.has(s.type) && !s.outsideEnclosure && impactsOcc(s))
    const seenWaterIds = new Set<string>()
    const waterOccFix = new Map<string, number>()
    for (const s of activeWater) {
      if (seenWaterIds.has(s.id)) continue
      const grp = [s]; seenWaterIds.add(s.id)
      const la = spaceLayouts[s.id]
      for (const o of activeWater) {
        if (seenWaterIds.has(o.id)) continue
        const lb = spaceLayouts[o.id]
        if (la && lb && rectsOverlap(la, lb)) { grp.push(o); seenWaterIds.add(o.id) }
      }
      if (grp.length > 1) {
        const ls = grp.map(g => spaceLayouts[g.id]).filter(Boolean)
        const unionSF = ls.length === grp.length ? rectUnionArea(ls) : grp.reduce((a, g) => a + g.squareFeet, 0)
        const groupOcc = Math.ceil(unionSF / 50)
        grp.forEach((g, i) => waterOccFix.set(g.id, i === 0 ? groupOcc : 0))
      }
    }
    const finalSpaceResults = waterOccFix.size === 0
      ? spaceResults
      : spaceResults.map(s => waterOccFix.has(s.id) ? { ...s, occupancy: waterOccFix.get(s.id)! } : s)

    // Compute shared clearance from canvas positions (intersection of clearance zones)
    const positions = appState.plannerLayout?.equipmentPositions ?? {}
    const equipSizes = appState.plannerLayout?.equipmentSizes ?? {}
    const computedShared: Record<string, number> = {}
    for (const item of equipment) {
      const stored = equipSizes[item.id]
      const fw = stored?.w ?? Math.sqrt(item.footprint)
      const fh = stored?.h ?? Math.sqrt(item.footprint)
      const clearW = stored?.clearW ?? (fw + (item.accessSpace > 0 ? (Math.sqrt(fw*fw + item.accessSpace) - fw) / 2 : 0) * 2)
      const clearH = stored?.clearH ?? (fh + (item.accessSpace > 0 ? (Math.sqrt(fh*fh + item.accessSpace) - fh) / 2 : 0) * 2)
      const borderX = (clearW - fw) / 2
      const borderY = (clearH - fh) / 2
      const zones = Array.from({ length: item.quantity }, (_, i) => {
        const pos = positions[`${item.id}:${i}`]
        if (!pos) return null
        return { x: pos.x - borderX, y: pos.y - borderY, w: clearW, h: clearH }
      }).filter(Boolean) as { x: number; y: number; w: number; h: number }[]
      let shared = 0
      for (let i = 0; i < zones.length; i++) {
        for (let j = i + 1; j < zones.length; j++) {
          const [a, b] = [zones[i], zones[j]]
          const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
          const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
          shared += iw * ih
        }
      }
      computedShared[item.id] = Math.round(shared)
    }

    const equipmentResults = equipment.map((item) => {
      const shared = computedShared[item.id] ?? 0
      const unit = item.footprint + item.accessSpace
      return { ...item, totalSpace: unit * item.quantity - shared * Math.max(0, item.quantity - 1) }
    })

    const totalEquipmentSpace = equipmentResults.reduce((s, e) => s + e.totalSpace, 0)
    // SF counts spaces within enclosure regardless of excludeFromOccupancy
    const inBoundsSF = (s: SpaceArea) => {
      const layout = spaceLayouts[s.id]
      return !enclosure || !layout || rectsOverlap(layout, enclosure)
    }
    const conditionedSF   = spaces.filter(s =>  s.isConditioned && inBoundsSF(s)).reduce((a, s) => a + s.squareFeet, 0)
    const unconditionedSF = spaces.filter(s => !s.isConditioned && inBoundsSF(s)).reduce((a, s) => a + s.squareFeet, 0)
    const totalSF = conditionedSF + unconditionedSF
    const farSF = spaces.filter(s => (s.impactsFAR ?? !isNonRoomType(s.type)) && inBoundsSF(s)).reduce((a, s) => a + s.squareFeet, 0)

    // Circulation baseline — enclosure area minus the intersection of every in-bounds room with the enclosure
    const enclosureArea = enclosure ? Math.round(enclosure.w * enclosure.h) : 0
    const roomsInEnclosureSF = enclosure
      ? spaces.reduce((a, s) => {
          const l = spaceLayouts[s.id]
          if (!l || !rectsOverlap(l, enclosure)) return a
          const iw = Math.max(0, Math.min(l.x + l.w, enclosure.x + enclosure.w) - Math.max(l.x, enclosure.x))
          const ih = Math.max(0, Math.min(l.y + l.h, enclosure.y + enclosure.h) - Math.max(l.y, enclosure.y))
          return a + Math.round(iw * ih)
        }, 0)
      : 0
    const circulationSF = Math.max(0, enclosureArea - roomsInEnclosureSF)
    const circulationOcc = circulationSF > 0 ? Math.ceil(circulationSF / IBC_LOAD_FACTORS["Circulation"]) : 0

    // Auto pool-deck occupancy — 3' setback ring around each water surface group.
    // Skipped when user has manually defined Pool Deck spaces (avoids double-counting).
    const hasManualPoolDeck = spaces.some(s => s.type === "Pool Deck")
    const waterSpacesForDeck = spaces.filter(s => waterTypes.has(s.type) && inBoundsSF(s))
    const seenW = new Set<string>()
    let autoDeckOcc = 0
    if (!hasManualPoolDeck) {
      for (const s of waterSpacesForDeck) {
        if (seenW.has(s.id)) continue
        const grp = [s]; seenW.add(s.id)
        const la = spaceLayouts[s.id]
        for (const o of waterSpacesForDeck) {
          if (seenW.has(o.id)) continue
          const lb = spaceLayouts[o.id]
          if (la && lb && rectsOverlap(la, lb)) { grp.push(o); seenW.add(o.id) }
        }
        const ls = grp.map(g => spaceLayouts[g.id]).filter(Boolean)
        if (!ls.length) continue
        const waterArea = rectUnionArea(ls)
        const expanded = ls.map(l => ({ x: l.x-3, y: l.y-3, w: l.w+6, h: l.h+6 }))
        const deckSF = Math.max(0, Math.round(rectUnionArea(expanded) - waterArea))
        autoDeckOcc += Math.ceil(deckSF / 15)
      }
    }

    const totalOccupancy = finalSpaceResults.reduce((s, sp) => s + sp.occupancy, 0) + autoDeckOcc + circulationOcc
    const gymTypes = ["Exercise Room (Equipment)", "Exercise Room (Concentrated)"]
    const totalGymSF = spaces.filter((s) => gymTypes.includes(s.type)).reduce((s, sp) => s + sp.squareFeet, 0)

    return {
      spaceResults: finalSpaceResults, computedShared, totalEquipmentSpace, conditionedSF, unconditionedSF, totalSF, farSF, totalOccupancy, totalGymSF,
      autoDeckOcc, circulationSF, circulationOcc,
      equipmentFitsInGym: totalGymSF >= totalEquipmentSpace,
      unconditionedOverLimit: unconditionedSF > unconditionedLimit,
      farOverLimit: farCap !== undefined && farSF > farCap,
      remainingOccupantLoad: maxOccupants !== undefined ? maxOccupants - totalOccupancy : undefined,
      wc: getWCRequirements(totalOccupancy),
      lavatories: getLavatoryCount(totalOccupancy),
    }
  }, [spaces, equipment, unconditionedLimit, maxOccupants, farCap, spaceLayouts, enclosure, appState.plannerLayout])

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-background text-foreground">

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-[1600px] flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <div className="shrink-0">
            <h1 className="text-base font-semibold">Cedar Occupancy Calculator</h1>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              IBC Table 1004.5 · Amenity Spaces
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const payload = { appState, calc: { ...calc, spaceResults: calc.spaceResults } }
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a"); a.href = url
                a.download = `cedar-debug-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.json`
                a.click(); URL.revokeObjectURL(url)
              }}
              className="rounded-md border border-border/60 px-2 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:bg-muted/40"
              title="Export debug JSON"
            >
              JSON
            </button>
            <ThemeToggle />
            <PersistencePanel
              currentState={appState}
              onLoad={(state) => setAppState(state, { skipHistory: true })}
              onCompare={() => setCompareOpen(true)}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 lg:px-8">

        {/* ── Settings (top) ── */}
        <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/60 bg-card px-4 py-3">
          <p className="shrink-0 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Project Settings
          </p>
          <div className="flex items-center gap-2">
            <Label htmlFor="max-occ" className="whitespace-nowrap text-xs text-muted-foreground">Max Occupants</Label>
            <Input id="max-occ" type="number" value={maxOccupants ?? ""} placeholder="—"
              onChange={(e) => setAppState((prev) => ({
                ...prev, maxOccupants: e.target.value ? Number(e.target.value) : undefined,
              }))}
              className="h-7 w-20 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="far-cap" className="whitespace-nowrap text-xs text-muted-foreground">FAR Cap (SF)</Label>
            <Input id="far-cap" type="number" value={farCap ?? ""} placeholder="—"
              onChange={(e) => setAppState((prev) => ({
                ...prev, farCap: e.target.value ? Number(e.target.value) : undefined,
              }))}
              className="h-7 w-24 text-sm" />
            {calc.farOverLimit && (
              <Badge variant="destructive" className="h-6 gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />+{(calc.conditionedSF - farCap!).toLocaleString()} SF
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="uncond-limit" className="whitespace-nowrap text-xs text-muted-foreground">Uncond. Limit (SF)</Label>
            <Input id="uncond-limit" type="number" value={unconditionedLimit}
              onChange={(e) => setAppState((prev) => ({
                ...prev, unconditionedLimit: Number(e.target.value),
              }))}
              className="h-7 w-24 text-sm" />
            {calc.unconditionedOverLimit && (
              <Badge variant="destructive" className="h-6 gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />+{calc.unconditionedSF - unconditionedLimit} SF
              </Badge>
            )}
          </div>
        </section>

        {/* ── Hero + Chart (primary KPIs first) ── */}
        <div className="flex gap-4 items-stretch">
          <HeroMetrics
            className="basis-[48%] shrink-0 min-w-0"
            totalOccupancy={calc.totalOccupancy}
            totalSF={calc.totalSF}
            conditionedSF={calc.conditionedSF}
            unconditionedSF={calc.unconditionedSF}
            unconditionedLimit={unconditionedLimit}
            unconditionedOverLimit={calc.unconditionedOverLimit}
            maxOccupants={maxOccupants}
            farCap={farCap}
            farOverLimit={calc.farOverLimit}
            remainingOccupantLoad={calc.remainingOccupantLoad}
          />
          <OccupancyChart
            className="flex-1 min-w-0"
            segments={calc.spaceResults}
            autoDeckOcc={calc.autoDeckOcc}
            totalOccupancy={calc.totalOccupancy}
          />
        </div>

        {/* ── Plumbing Requirements ── */}
        <section className="grid grid-cols-4 gap-3">
          {[
            { label: "Total WCs", value: calc.wc.total, sub: "IBC Table 2902.1" },
            { label: "Accessible", value: calc.wc.accessible, sub: "of total WCs" },
            { label: "Non-Accessible", value: calc.wc.nonAccessible, sub: "standard stalls" },
            { label: "Lavatories", value: calc.lavatories, sub: `for ${calc.totalOccupancy} occ` },
          ].map(({ label, value, sub }) => (
            <div key={label} className="overflow-hidden rounded-xl border border-border/60 bg-card px-4 py-3 flex flex-col gap-1">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="font-black tabular-nums text-4xl leading-none">{value}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{sub}</p>
            </div>
          ))}
        </section>

        {/* ── Canvas (primary — drag handles set SF) ── */}
        <section className="overflow-hidden rounded-xl border border-border/60">
          <div className="flex items-center justify-between border-b border-border/60 bg-card px-4 py-2.5">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Floor Plan · drag room edges to resize · drag equipment to reposition · drag footprint inside clearance zone
              </p>
            </div>
            {calc.totalGymSF > 0 && (
              <span className={`rounded-md border px-2 py-1 font-mono text-xs ${
                calc.equipmentFitsInGym
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}>
                {calc.totalEquipmentSpace} SF equip {calc.equipmentFitsInGym ? "✓ fits" : "✗ overflow"}
              </span>
            )}
          </div>
          <SpacePlanner
            spaces={spaces}
            equipment={equipment}
            spaceLayouts={spaceLayouts}
            enclosure={enclosure}
            storedEquipPositions={appState.plannerLayout?.equipmentPositions}
            storedEquipSizes={appState.plannerLayout?.equipmentSizes}
            isDark={isDark}
            onSpaceResize={handleSpaceResize}
            onEnclosureChange={handleEnclosureChange}
            onEquipPositionsChange={(positions) =>
              setAppState((prev) => ({
                ...prev,
                plannerLayout: { ...prev.plannerLayout, equipmentPositions: positions },
              }), { skipHistory: true })
            }
            onEquipResize={updateEquipment}
            onEquipSizeChange={(id, size) =>
              setAppState((prev) => ({
                ...prev,
                equipment: prev.equipment.map(e => e.id === id
                  ? { ...e, footprint: Math.round(size.w * size.h), accessSpace: Math.max(0, Math.round(size.clearW * size.clearH - size.w * size.h)) }
                  : e),
                plannerLayout: {
                  ...prev.plannerLayout,
                  equipmentPositions: prev.plannerLayout?.equipmentPositions ?? {},
                  equipmentSizes: { ...prev.plannerLayout?.equipmentSizes, [id]: size },
                },
              }), { skipHistory: false })
            }
            onDuplicate={duplicateSpace}
            onDeleteSpace={removeSpace}
          />
        </section>

        {/* ── Totals | Area Management | Equipment Manager ── */}
        <section className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1.3fr)] gap-4 items-start">
          <FlowChain
            spaceResults={calc.spaceResults}
            spaceLayouts={spaceLayouts}
            totalOccupancy={calc.totalOccupancy}
            farCap={farCap}
            unconditionedLimit={unconditionedLimit}
          />
          <SpaceEditor
            spaces={spaces}
            onAdd={addSpace}
            onDuplicate={duplicateSpace}
            onUpdate={updateSpace}
            onRemove={removeSpace}
          />
          <EquipmentEditor
            equipment={equipment}
            computedShared={calc.computedShared}
            totalEquipmentSpace={calc.totalEquipmentSpace}
            totalGymSF={calc.totalGymSF}
            equipmentFitsInGym={calc.equipmentFitsInGym}
            onAdd={addEquipment}
            onUpdate={updateEquipment}
            onRemove={removeEquipment}
          />
        </section>

        {/* ── IBC Reference ── */}
        <section className="overflow-hidden rounded-xl border border-border/60">
          <button
            className="flex w-full items-center justify-between border-b border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
            onClick={() => setIbcOpen(!ibcOpen)}
          >
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
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
