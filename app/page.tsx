"use client"

import { useMemo, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trash2, Plus, AlertTriangle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PersistencePanel } from "@/components/persistence-panel"
import { VersionCompare } from "@/components/version-compare"
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
  { id: "1", name: "Main Pool", type: "Swimming Pool (Water Surface)", squareFeet: 800, isConditioned: true },
  { id: "2", name: "Pool Deck", type: "Pool Deck", squareFeet: 600, isConditioned: true },
  { id: "3", name: "Sauna", type: "Sauna/Steam Room", squareFeet: 120, isConditioned: false },
  { id: "4", name: "Cold Plunge", type: "Cold Plunge (Water Surface)", squareFeet: 48, isConditioned: true },
  { id: "5", name: "Locker Room", type: "Locker Room", squareFeet: 400, isConditioned: true },
]

const defaultEquipment: EquipmentItem[] = [
  { id: "1", name: "Treadmill", footprint: 20, accessSpace: 35, quantity: 2 },
  { id: "2", name: "Elliptical", footprint: 18, accessSpace: 30, quantity: 2 },
  { id: "3", name: "Stationary Bike", footprint: 12, accessSpace: 20, quantity: 2 },
  { id: "4", name: "Weight Bench", footprint: 15, accessSpace: 40, quantity: 1 },
  { id: "5", name: "Cable Machine", footprint: 25, accessSpace: 60, quantity: 1 },
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

  const addSpace = () => {
    const newSpace: SpaceArea = {
      id: crypto.randomUUID(),
      name: "New Space",
      type: "Pool Deck",
      squareFeet: 0,
      isConditioned: true,
    }
    setAppState((prev) => ({ ...prev, spaces: [...prev.spaces, newSpace] }))
  }

  const updateSpace = (id: string, updates: Partial<SpaceArea>) => {
    setAppState((prev) => ({
      ...prev,
      spaces: prev.spaces.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }))
  }

  const removeSpace = (id: string) => {
    setAppState((prev) => ({ ...prev, spaces: prev.spaces.filter((s) => s.id !== id) }))
  }

  const addEquipment = () => {
    const newItem: EquipmentItem = {
      id: crypto.randomUUID(),
      name: "New Equipment",
      footprint: 15,
      accessSpace: 30,
      sharedClearance: 0,
      quantity: 1,
    }
    setAppState((prev) => ({ ...prev, equipment: [...prev.equipment, newItem] }))
  }

  const updateEquipment = (id: string, updates: Partial<EquipmentItem>) => {
    setAppState((prev) => ({
      ...prev,
      equipment: prev.equipment.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }))
  }

  const removeEquipment = (id: string) => {
    setAppState((prev) => ({ ...prev, equipment: prev.equipment.filter((e) => e.id !== id) }))
  }

  const calculations = useMemo(() => {
    const spaceResults = spaces.map((space) => ({
      ...space,
      loadFactor: IBC_LOAD_FACTORS[space.type],
      occupancy: Math.ceil(space.squareFeet / IBC_LOAD_FACTORS[space.type]),
    }))

    // footprint = equipment dimension, accessSpace = clearance added on top
    // sharedClearance = clearance saved per adjacent pair when units are grouped
    const equipmentResults = equipment.map((item) => {
      const shared = item.sharedClearance ?? 0
      const footprintPerUnit = item.footprint + item.accessSpace
      const sharedSavings = shared * Math.max(0, item.quantity - 1)
      const totalSpace = footprintPerUnit * item.quantity - sharedSavings
      return {
        ...item,
        footprintPerUnit,
        totalEquip: item.footprint * item.quantity,
        totalClearance: item.accessSpace * item.quantity,
        sharedSavings,
        totalSpace,
      }
    })

    const totalEquipmentSpace = equipmentResults.reduce((sum, e) => sum + e.totalSpace, 0)
    const equipmentOccupancy = Math.ceil(totalEquipmentSpace / IBC_LOAD_FACTORS["Exercise Room (Equipment)"])

    const conditionedSF = spaces.filter((s) => s.isConditioned).reduce((sum, s) => sum + s.squareFeet, 0)
    const unconditionedSF = spaces.filter((s) => !s.isConditioned).reduce((sum, s) => sum + s.squareFeet, 0)
    const totalSF = conditionedSF + unconditionedSF
    const spaceOccupancy = spaceResults.reduce((sum, s) => sum + s.occupancy, 0)
    const totalOccupancy = spaceOccupancy

    const wc = getWCRequirements(totalOccupancy)
    const lavatories = getLavatoryCount(totalOccupancy)
    const remainingOccupantLoad = maxOccupants !== undefined ? maxOccupants - totalOccupancy : undefined

    return {
      spaceResults,
      equipmentResults,
      totalEquipmentSpace,
      equipmentOccupancy,
      conditionedSF,
      unconditionedSF,
      totalSF,
      totalOccupancy,
      unconditionedOverLimit: unconditionedSF > unconditionedLimit,
      farOverLimit: farCap !== undefined && conditionedSF > farCap,
      remainingOccupantLoad,
      wc,
      lavatories,
    }
  }, [spaces, equipment, unconditionedLimit, maxOccupants, farCap])

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">IBC Amenity Space Occupancy Calculator</h1>
          <p className="mt-2 text-muted-foreground">
            Calculate occupancy loads based on International Building Code standards
          </p>
        </header>

        {/* Persistence Bar */}
        <div className="mb-6 rounded-lg border bg-card p-3">
          <PersistencePanel
            currentState={appState}
            onLoad={(state) => setAppState(state, { skipHistory: true })}
            onCompare={() => setCompareOpen(true)}
          />
        </div>

        {/* Summary Cards */}
        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Area</CardDescription>
              <CardTitle className="text-2xl">{calculations.totalSF.toLocaleString()} SF</CardTitle>
            </CardHeader>
          </Card>
          <Card className={calculations.remainingOccupantLoad !== undefined && calculations.remainingOccupantLoad < 0 ? "border-destructive" : ""}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                Total Occupancy
                {calculations.remainingOccupantLoad !== undefined && calculations.remainingOccupantLoad < 0 && (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
              </CardDescription>
              <CardTitle className={`text-2xl ${calculations.remainingOccupantLoad !== undefined && calculations.remainingOccupantLoad < 0 ? "text-destructive" : ""}`}>
                {calculations.totalOccupancy} persons
              </CardTitle>
              {maxOccupants !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Cap: {maxOccupants} | Remaining:{" "}
                  <span className={calculations.remainingOccupantLoad! < 0 ? "text-destructive font-semibold" : "text-foreground font-semibold"}>
                    {calculations.remainingOccupantLoad}
                  </span>
                </p>
              )}
            </CardHeader>
          </Card>
          <Card className={calculations.farOverLimit ? "border-destructive" : ""}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                Conditioned Space
                {calculations.farOverLimit && <AlertTriangle className="h-4 w-4 text-destructive" />}
              </CardDescription>
              <CardTitle className={`text-2xl ${calculations.farOverLimit ? "text-destructive" : "text-primary"}`}>
                {calculations.conditionedSF.toLocaleString()} SF
              </CardTitle>
              {farCap !== undefined && (
                <p className="text-xs text-muted-foreground">FAR cap: {farCap.toLocaleString()} SF</p>
              )}
            </CardHeader>
          </Card>
          <Card className={calculations.unconditionedOverLimit ? "border-destructive" : ""}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                Unconditioned Space
                {calculations.unconditionedOverLimit && <AlertTriangle className="h-4 w-4 text-destructive" />}
              </CardDescription>
              <CardTitle className={`text-2xl ${calculations.unconditionedOverLimit ? "text-destructive" : "text-muted-foreground"}`}>
                {calculations.unconditionedSF.toLocaleString()} SF
              </CardTitle>
              <p className="text-xs text-muted-foreground">Limit: {unconditionedLimit.toLocaleString()} SF</p>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Space Areas Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Space Areas</CardTitle>
                  <CardDescription>Define amenity spaces and their types</CardDescription>
                </div>
                <Button onClick={addSpace} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Space
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {spaces.map((space) => (
                <div key={space.id} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <Input
                      value={space.name}
                      onChange={(e) => updateSpace(space.id, { name: e.target.value })}
                      className="h-8 w-48 font-medium"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeSpace(space.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Space Type</Label>
                      <Select value={space.type} onValueChange={(v) => updateSpace(space.id, { type: v as SpaceType })}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(IBC_LOAD_FACTORS).map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Square Feet</Label>
                      <Input
                        type="number"
                        value={space.squareFeet}
                        onChange={(e) => updateSpace(space.id, { squareFeet: Number(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={space.isConditioned}
                        onCheckedChange={(v) => updateSpace(space.id, { isConditioned: v })}
                      />
                      <Label className="text-sm">
                        {space.isConditioned ? (
                          <Badge variant="default">Conditioned</Badge>
                        ) : (
                          <Badge variant="secondary">Unconditioned</Badge>
                        )}
                      </Label>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      Load: {IBC_LOAD_FACTORS[space.type]} SF/person |{" "}
                      <span className="font-medium text-foreground">
                        {Math.ceil(space.squareFeet / IBC_LOAD_FACTORS[space.type])} occupants
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Equipment Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Gym Equipment</CardTitle>
                  <CardDescription>Equipment footprints and access clearances</CardDescription>
                </div>
                <Button onClick={addEquipment} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Equipment
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {equipment.map((item) => (
                <div key={item.id} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <Input
                      value={item.name}
                      onChange={(e) => updateEquipment(item.id, { name: e.target.value })}
                      className="h-8 w-48 font-medium"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeEquipment(item.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Equipment (SF)</Label>
                      <Input
                        type="number"
                        value={item.footprint}
                        onChange={(e) => updateEquipment(item.id, { footprint: Number(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Access (SF)</Label>
                      <Input
                        type="number"
                        value={item.accessSpace}
                        onChange={(e) => updateEquipment(item.id, { accessSpace: Number(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Shared/pair (SF)</Label>
                      <Input
                        type="number"
                        value={item.sharedClearance ?? 0}
                        onChange={(e) => updateEquipment(item.id, { sharedClearance: Number(e.target.value) })}
                        className="mt-1"
                        min={0}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Quantity</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateEquipment(item.id, { quantity: Number(e.target.value) })}
                        className="mt-1"
                        min={1}
                      />
                    </div>
                  </div>
                  {(() => {
                    const shared = item.sharedClearance ?? 0
                    const fpUnit = item.footprint + item.accessSpace
                    const savings = shared * Math.max(0, item.quantity - 1)
                    const total = fpUnit * item.quantity - savings
                    return (
                      <div className="mt-3 text-right text-sm text-muted-foreground">
                        Footprint: <span className="font-medium text-foreground">{fpUnit} SF</span>/unit
                        {" · "}Total: <span className="font-medium text-foreground">{total} SF</span>
                        {savings > 0 && (
                          <span className="ml-1 text-green-600 dark:text-green-400">
                            (−{savings} shared)
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ))}
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Required SF (layout verification only)</span>
                <span className="font-semibold">{calculations.totalEquipmentSpace} SF</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Settings */}
        <Card className="my-8">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <Label htmlFor="unconditioned-limit">Unconditioned Limit (SF):</Label>
                <Input
                  id="unconditioned-limit"
                  type="number"
                  value={unconditionedLimit}
                  onChange={(e) =>
                    setAppState((prev) => ({ ...prev, unconditionedLimit: Number(e.target.value) }))
                  }
                  className="w-28"
                />
                {calculations.unconditionedOverLimit && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Over by {calculations.unconditionedSF - unconditionedLimit} SF
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="max-occupants">Max Occupants:</Label>
                <Input
                  id="max-occupants"
                  type="number"
                  value={maxOccupants ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    setAppState((prev) => ({
                      ...prev,
                      maxOccupants: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-24"
                />
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="far-cap">FAR Cap (SF):</Label>
                <Input
                  id="far-cap"
                  type="number"
                  value={farCap ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    setAppState((prev) => ({
                      ...prev,
                      farCap: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-28"
                />
                {calculations.farOverLimit && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Over by {calculations.conditionedSF - farCap!} SF
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Tables */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Spaces Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle>Space Area Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Space</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">SF</TableHead>
                    <TableHead className="text-right">Load Factor</TableHead>
                    <TableHead className="text-right">Occupancy</TableHead>
                    <TableHead>Conditioned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculations.spaceResults.map((space) => (
                    <TableRow key={space.id}>
                      <TableCell className="font-medium">{space.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{space.type}</TableCell>
                      <TableCell className="text-right">{space.squareFeet.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{space.loadFactor}</TableCell>
                      <TableCell className="text-right font-semibold">{space.occupancy}</TableCell>
                      <TableCell>
                        {space.isConditioned ? (
                          <Badge variant="default" className="text-xs">Yes</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">No</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={2}>Subtotal (Spaces)</TableCell>
                    <TableCell className="text-right">
                      {calculations.spaceResults.reduce((s, r) => s + r.squareFeet, 0).toLocaleString()}
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right">
                      {calculations.spaceResults.reduce((s, r) => s + r.occupancy, 0)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Equipment Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle>Equipment Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Equipment</TableHead>
                    <TableHead className="text-right">Access</TableHead>
                    <TableHead className="text-right">Footprint (total)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculations.equipmentResults.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{item.totalEquip}</TableCell>
                      <TableCell className="text-right">{item.totalClearance}</TableCell>
                      <TableCell className="text-right font-semibold">{item.totalSpace}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={2}>Subtotal (Equipment)</TableCell>
                    <TableCell className="text-right">
                      {calculations.equipmentResults.reduce((s, e) => s + e.totalEquip, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {calculations.equipmentResults.reduce((s, e) => s + e.totalClearance, 0)}
                    </TableCell>
                    <TableCell className="text-right">{calculations.totalEquipmentSpace}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* WC / Lavatory Requirements */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Plumbing Requirements</CardTitle>
            <CardDescription>IBC-derived water closet and lavatory counts for {calculations.totalOccupancy} occupants</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded border p-3 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total WCs</p>
                <p className="mt-1 text-3xl font-bold">{calculations.wc.total}</p>
              </div>
              <div className="rounded border p-3 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Accessible WCs</p>
                <p className="mt-1 text-3xl font-bold">{calculations.wc.accessible}</p>
                <p className="text-xs text-muted-foreground">{calculations.wc.nonAccessible} non-accessible</p>
              </div>
              <div className="rounded border p-3 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Lavatories</p>
                <p className="mt-1 text-3xl font-bold">{calculations.lavatories}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* IBC Reference */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>IBC Occupancy Load Reference</CardTitle>
            <CardDescription>International Building Code Table 1004.5 – Maximum Floor Area Allowances Per Occupant</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {Object.entries(IBC_LOAD_FACTORS).map(([type, factor]) => (
                <div key={type} className="flex items-center justify-between rounded border p-2 text-sm">
                  <span className="text-muted-foreground">{type}</span>
                  <Badge variant="outline">{factor} SF</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <VersionCompare open={compareOpen} onOpenChange={setCompareOpen} />
    </main>
  )
}
