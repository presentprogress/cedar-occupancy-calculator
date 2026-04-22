"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { IBC_LOAD_FACTORS, type AppState } from "@/lib/types"

interface VersionMeta {
  id: number
  name: string
  isAuto: boolean
  createdAt: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Delta({ a, b }: { a: number; b: number }) {
  const diff = b - a
  if (diff === 0) return <span className="text-muted-foreground">—</span>
  const cls = diff > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
  return <span className={cls}>{diff > 0 ? "+" : ""}{diff.toLocaleString()}</span>
}

function StatRow({ label, a, b, unit = "" }: { label: string; a: number; b: number; unit?: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-4">
        <span className="w-20 text-right">{a.toLocaleString()}{unit}</span>
        <span className="w-20 text-right">{b.toLocaleString()}{unit}</span>
        <span className="w-16 text-right"><Delta a={a} b={b} /></span>
      </div>
    </div>
  )
}

export function VersionCompare({ open, onOpenChange }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [idA, setIdA] = useState<string>("")
  const [idB, setIdB] = useState<string>("")
  const [stateA, setStateA] = useState<AppState | null>(null)
  const [stateB, setStateB] = useState<AppState | null>(null)

  useEffect(() => {
    if (!open) return
    fetch("/api/versions")
      .then((r) => r.json())
      .then(setVersions)
      .catch(() => {})
  }, [open])

  const loadState = async (id: string, setter: (s: AppState) => void) => {
    if (!id) return
    const res = await fetch(`/api/versions/${id}`)
    if (res.ok) {
      const row = await res.json()
      setter(row.state as AppState)
    }
  }

  const handleSelectA = (val: string) => {
    setIdA(val)
    setStateA(null)
    loadState(val, setStateA)
  }

  const handleSelectB = (val: string) => {
    setIdB(val)
    setStateB(null)
    loadState(val, setStateB)
  }

  const spaceMap = (state: AppState) => new Map(state.spaces.map((s) => [s.name, s]))
  const equipMap = (state: AppState) => new Map(state.equipment.map((e) => [e.name, e]))

  const allSpaceNames = stateA && stateB
    ? Array.from(new Set([...stateA.spaces.map((s) => s.name), ...stateB.spaces.map((s) => s.name)]))
    : []

  const allEquipNames = stateA && stateB
    ? Array.from(new Set([...stateA.equipment.map((e) => e.name), ...stateB.equipment.map((e) => e.name)]))
    : []

  const totalOccA = stateA
    ? stateA.spaces.reduce((sum, s) => sum + Math.ceil(s.squareFeet / IBC_LOAD_FACTORS[s.type]), 0)
    : 0
  const totalOccB = stateB
    ? stateB.spaces.reduce((sum, s) => sum + Math.ceil(s.squareFeet / IBC_LOAD_FACTORS[s.type]), 0)
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare Versions</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Version A</p>
            <Select value={idA} onValueChange={handleSelectA}>
              <SelectTrigger><SelectValue placeholder="Select version…" /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name}
                    {v.isAuto && <span className="ml-1 text-muted-foreground">(auto)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Version B</p>
            <Select value={idB} onValueChange={handleSelectB}>
              <SelectTrigger><SelectValue placeholder="Select version…" /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name}
                    {v.isAuto && <span className="ml-1 text-muted-foreground">(auto)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {stateA && stateB && (
          <div className="mt-4 space-y-6">
            {/* Summary */}
            <div>
              <p className="mb-2 text-sm font-semibold">Summary</p>
              <div className="rounded border p-3 space-y-0.5">
                <div className="grid grid-cols-4 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  <span></span>
                  <span className="text-right">Version A</span>
                  <span className="text-right">Version B</span>
                  <span className="text-right">Delta</span>
                </div>
                <StatRow label="Total Occupancy" a={totalOccA} b={totalOccB} unit=" ppl" />
                <StatRow
                  label="Max Occupants Cap"
                  a={stateA.maxOccupants ?? 0}
                  b={stateB.maxOccupants ?? 0}
                  unit=" ppl"
                />
                <StatRow
                  label="FAR Cap"
                  a={stateA.farCap ?? 0}
                  b={stateB.farCap ?? 0}
                  unit=" SF"
                />
                <StatRow
                  label="Remaining Load"
                  a={(stateA.maxOccupants ?? 0) - totalOccA}
                  b={(stateB.maxOccupants ?? 0) - totalOccB}
                  unit=" ppl"
                />
              </div>
            </div>

            <Separator />

            {/* Spaces */}
            <div>
              <p className="mb-2 text-sm font-semibold">Space Areas</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Space</TableHead>
                    <TableHead className="text-right">SF (A)</TableHead>
                    <TableHead className="text-right">SF (B)</TableHead>
                    <TableHead className="text-right">Δ SF</TableHead>
                    <TableHead className="text-right">Occ (A)</TableHead>
                    <TableHead className="text-right">Occ (B)</TableHead>
                    <TableHead className="text-right">Δ Occ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allSpaceNames.map((name) => {
                    const a = spaceMap(stateA).get(name)
                    const b = spaceMap(stateB).get(name)
                    const isAdded = !a && !!b
                    const isRemoved = !!a && !b
                    const sfA = a?.squareFeet ?? 0
                    const sfB = b?.squareFeet ?? 0
                    const type = a?.type ?? b?.type ?? "Pool Deck"
                    const factor = IBC_LOAD_FACTORS[type]
                    const occA = a ? Math.ceil(a.squareFeet / factor) : 0
                    const occB = b ? Math.ceil(b.squareFeet / factor) : 0
                    return (
                      <TableRow
                        key={name}
                        className={
                          isAdded ? "bg-green-50 dark:bg-green-950/20" :
                          isRemoved ? "bg-red-50 dark:bg-red-950/20" : ""
                        }
                      >
                        <TableCell className="font-medium">
                          {name}
                          {isAdded && <Badge variant="outline" className="ml-2 text-xs text-green-600">Added</Badge>}
                          {isRemoved && <Badge variant="outline" className="ml-2 text-xs text-red-600">Removed</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{sfA > 0 ? sfA.toLocaleString() : "—"}</TableCell>
                        <TableCell className="text-right">{sfB > 0 ? sfB.toLocaleString() : "—"}</TableCell>
                        <TableCell className="text-right"><Delta a={sfA} b={sfB} /></TableCell>
                        <TableCell className="text-right">{occA > 0 ? occA : "—"}</TableCell>
                        <TableCell className="text-right">{occB > 0 ? occB : "—"}</TableCell>
                        <TableCell className="text-right"><Delta a={occA} b={occB} /></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <Separator />

            {/* Equipment */}
            <div>
              <p className="mb-2 text-sm font-semibold">Equipment</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead className="text-right">Qty (A)</TableHead>
                    <TableHead className="text-right">Qty (B)</TableHead>
                    <TableHead className="text-right">Total SF (A)</TableHead>
                    <TableHead className="text-right">Total SF (B)</TableHead>
                    <TableHead className="text-right">Δ SF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allEquipNames.map((name) => {
                    const a = equipMap(stateA).get(name)
                    const b = equipMap(stateB).get(name)
                    const isAdded = !a && !!b
                    const isRemoved = !!a && !b
                    const equipTotal = (e: typeof a) => e
                      ? (e.footprint + e.accessSpace) * e.quantity - (e.sharedClearance ?? 0) * Math.max(0, e.quantity - 1)
                      : 0
                    const sfA = equipTotal(a)
                    const sfB = equipTotal(b)
                    return (
                      <TableRow
                        key={name}
                        className={
                          isAdded ? "bg-green-50 dark:bg-green-950/20" :
                          isRemoved ? "bg-red-50 dark:bg-red-950/20" : ""
                        }
                      >
                        <TableCell className="font-medium">
                          {name}
                          {isAdded && <Badge variant="outline" className="ml-2 text-xs text-green-600">Added</Badge>}
                          {isRemoved && <Badge variant="outline" className="ml-2 text-xs text-red-600">Removed</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{a?.quantity ?? "—"}</TableCell>
                        <TableCell className="text-right">{b?.quantity ?? "—"}</TableCell>
                        <TableCell className="text-right">{sfA > 0 ? sfA.toLocaleString() : "—"}</TableCell>
                        <TableCell className="text-right">{sfB > 0 ? sfB.toLocaleString() : "—"}</TableCell>
                        <TableCell className="text-right"><Delta a={sfA} b={sfB} /></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
