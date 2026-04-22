"use client"

import { useState, useMemo } from "react"
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

// IBC Occupancy Load Factors (sq ft per person)
const IBC_LOAD_FACTORS = {
  "Swimming Pool (Water Surface)": 50,
  "Pool Deck": 15,
  "Exercise Room (Equipment)": 50,
  "Exercise Room (Concentrated)": 15,
  "Locker Room": 50,
  "Sauna/Steam Room": 15,
  "Spa/Hot Tub (Water Surface)": 50,
  "Cold Plunge (Water Surface)": 50,
  "Lobby/Reception": 15,
  "Storage": 300,
  "Mechanical": 300,
  "Office": 100,
} as const

type SpaceType = keyof typeof IBC_LOAD_FACTORS

interface SpaceArea {
  id: string
  name: string
  type: SpaceType
  squareFeet: number
  isConditioned: boolean
}

interface EquipmentItem {
  id: string
  name: string
  footprint: number
  accessSpace: number
  quantity: number
}

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

export default function OccupancyCalculator() {
  const [spaces, setSpaces] = useState<SpaceArea[]>(defaultSpaces)
  const [equipment, setEquipment] = useState<EquipmentItem[]>(defaultEquipment)
  const [unconditionedLimit, setUnconditionedLimit] = useState(500)

  const addSpace = () => {
    const newSpace: SpaceArea = {
      id: Date.now().toString(),
      name: "New Space",
      type: "Pool Deck",
      squareFeet: 0,
      isConditioned: true,
    }
    setSpaces([...spaces, newSpace])
  }

  const updateSpace = (id: string, updates: Partial<SpaceArea>) => {
    setSpaces(spaces.map((s) => (s.id === id ? { ...s, ...updates } : s)))
  }

  const removeSpace = (id: string) => {
    setSpaces(spaces.filter((s) => s.id !== id))
  }

  const addEquipment = () => {
    const newEquipment: EquipmentItem = {
      id: Date.now().toString(),
      name: "New Equipment",
      footprint: 15,
      accessSpace: 30,
      quantity: 1,
    }
    setEquipment([...equipment, newEquipment])
  }

  const updateEquipment = (id: string, updates: Partial<EquipmentItem>) => {
    setEquipment(equipment.map((e) => (e.id === id ? { ...e, ...updates } : e)))
  }

  const removeEquipment = (id: string) => {
    setEquipment(equipment.filter((e) => e.id !== id))
  }

  const calculations = useMemo(() => {
    const spaceResults = spaces.map((space) => ({
      ...space,
      loadFactor: IBC_LOAD_FACTORS[space.type],
      occupancy: Math.ceil(space.squareFeet / IBC_LOAD_FACTORS[space.type]),
    }))

    const equipmentResults = equipment.map((item) => ({
      ...item,
      totalFootprint: item.footprint * item.quantity,
      totalAccessSpace: item.accessSpace * item.quantity,
      totalSpace: (item.footprint + item.accessSpace) * item.quantity,
    }))

    const totalEquipmentSpace = equipmentResults.reduce((sum, e) => sum + e.totalSpace, 0)
    const equipmentOccupancy = Math.ceil(totalEquipmentSpace / IBC_LOAD_FACTORS["Exercise Room (Equipment)"])

    const conditionedSF = spaces.filter((s) => s.isConditioned).reduce((sum, s) => sum + s.squareFeet, 0)
    const unconditionedSF = spaces.filter((s) => !s.isConditioned).reduce((sum, s) => sum + s.squareFeet, 0)
    const totalSF = conditionedSF + unconditionedSF + totalEquipmentSpace
    const totalOccupancy = spaceResults.reduce((sum, s) => sum + s.occupancy, 0) + equipmentOccupancy

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
    }
  }, [spaces, equipment, unconditionedLimit])

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">IBC Amenity Space Occupancy Calculator</h1>
          <p className="mt-2 text-muted-foreground">
            Calculate occupancy loads based on International Building Code standards
          </p>
        </header>

        {/* Summary Cards */}
        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Area</CardDescription>
              <CardTitle className="text-2xl">{calculations.totalSF.toLocaleString()} SF</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Max Occupancy</CardDescription>
              <CardTitle className="text-2xl">{calculations.totalOccupancy} persons</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Conditioned Space</CardDescription>
              <CardTitle className="text-2xl text-primary">{calculations.conditionedSF.toLocaleString()} SF</CardTitle>
            </CardHeader>
          </Card>
          <Card className={calculations.unconditionedOverLimit ? "border-destructive" : ""}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                Unconditioned Space
                {calculations.unconditionedOverLimit && <AlertTriangle className="h-4 w-4 text-destructive" />}
              </CardDescription>
              <CardTitle
                className={`text-2xl ${calculations.unconditionedOverLimit ? "text-destructive" : "text-muted-foreground"}`}
              >
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
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Footprint (SF)</Label>
                      <Input
                        type="number"
                        value={item.footprint}
                        onChange={(e) => updateEquipment(item.id, { footprint: Number(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Access Space (SF)</Label>
                      <Input
                        type="number"
                        value={item.accessSpace}
                        onChange={(e) => updateEquipment(item.id, { accessSpace: Number(e.target.value) })}
                        className="mt-1"
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
                  <div className="mt-3 text-right text-sm text-muted-foreground">
                    Total:{" "}
                    <span className="font-medium text-foreground">
                      {(item.footprint + item.accessSpace) * item.quantity} SF
                    </span>{" "}
                    ({item.footprint * item.quantity} + {item.accessSpace * item.quantity} access)
                  </div>
                </div>
              ))}
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span>Total Equipment Area</span>
                <span className="font-semibold">{calculations.totalEquipmentSpace} SF</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Equipment Occupancy (50 SF/person)</span>
                <span className="font-semibold">{calculations.equipmentOccupancy} persons</span>
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
            <div className="flex items-center gap-4">
              <Label htmlFor="unconditioned-limit">Unconditioned Space Limit (SF):</Label>
              <Input
                id="unconditioned-limit"
                type="number"
                value={unconditionedLimit}
                onChange={(e) => setUnconditionedLimit(Number(e.target.value))}
                className="w-32"
              />
              {calculations.unconditionedOverLimit && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Over limit by {calculations.unconditionedSF - unconditionedLimit} SF
                </Badge>
              )}
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
                          <Badge variant="default" className="text-xs">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            No
                          </Badge>
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
                    <TableHead className="text-right">Footprint</TableHead>
                    <TableHead className="text-right">Access</TableHead>
                    <TableHead className="text-right">Total SF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculations.equipmentResults.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{item.totalFootprint}</TableCell>
                      <TableCell className="text-right">{item.totalAccessSpace}</TableCell>
                      <TableCell className="text-right font-semibold">{item.totalSpace}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={2}>Subtotal (Equipment)</TableCell>
                    <TableCell className="text-right">
                      {calculations.equipmentResults.reduce((s, e) => s + e.totalFootprint, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {calculations.equipmentResults.reduce((s, e) => s + e.totalAccessSpace, 0)}
                    </TableCell>
                    <TableCell className="text-right">{calculations.totalEquipmentSpace}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* IBC Reference */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>IBC Occupancy Load Reference</CardTitle>
            <CardDescription>International Building Code Table 1004.5 - Maximum Floor Area Allowances Per Occupant</CardDescription>
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
    </main>
  )
}
