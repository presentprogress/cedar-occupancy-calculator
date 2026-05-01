"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, Plus, Copy } from "lucide-react"
import { IBC_LOAD_FACTORS, isNonRoomType, type SpaceType, type SpaceArea } from "@/lib/types"

interface SpaceEditorProps {
  spaces: SpaceArea[]
  onAdd: () => void
  onDuplicate: (id: string) => void
  onUpdate: (id: string, updates: Partial<SpaceArea>) => void
  onRemove: (id: string) => void
}

export function SpaceEditor({ spaces, onAdd, onDuplicate, onUpdate, onRemove }: SpaceEditorProps) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label-eyebrow">Area Management</span>
        <div className="flex items-center gap-2">
          <span className="label-eyebrow">{spaces.length} spaces</span>
          <Button onClick={onAdd} size="sm" variant="outline" className="h-7 gap-1 text-xs">
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {spaces.map((space) => {
          const isNonRoom = isNonRoomType(space.type)
          // Resolve with backward-compat fallback for saved state that used excludeFromOccupancy
          const impactsOcc = space.impactsOccupancy ?? !(space.excludeFromOccupancy ?? false)
          const impactsFAR = space.impactsFAR ?? !isNonRoom
          const excluded = !impactsOcc

          return (
            <div key={space.id} className={`px-4 py-3 space-y-2 ${excluded ? "opacity-60" : ""}`}>
              {/* Row 1: Name + SF */}
              <div className="grid grid-cols-[1fr,88px] gap-2">
                <Input
                  value={space.name}
                  onChange={(e) => onUpdate(space.id, { name: e.target.value })}
                  className={`h-8 text-sm font-medium ${excluded ? "line-through text-muted-foreground" : ""}`}
                />
                <Input
                  type="number"
                  value={space.squareFeet}
                  onChange={(e) => onUpdate(space.id, { squareFeet: Number(e.target.value) })}
                  className="h-8 text-right text-sm tabular-nums"
                  placeholder="SF"
                />
              </div>

              {/* Row 2: Three impact toggles — standardized positive framing */}
              <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
                {/* Conditioned — disabled for non-rooms (water surfaces, pool deck) */}
                <label className={`flex items-center gap-1.5 ${isNonRoom ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
                  <Switch
                    checked={space.isConditioned}
                    onCheckedChange={(v) => { if (!isNonRoom) onUpdate(space.id, { isConditioned: v }) }}
                    disabled={isNonRoom}
                    className="scale-75 origin-left"
                  />
                  <span className="text-xs text-muted-foreground">Conditioned</span>
                </label>

                {/* Impacts FAR — disabled for non-rooms */}
                <label className={`flex items-center gap-1.5 ${isNonRoom ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
                  <Switch
                    checked={impactsFAR}
                    onCheckedChange={(v) => { if (!isNonRoom) onUpdate(space.id, { impactsFAR: v }) }}
                    disabled={isNonRoom}
                    className="scale-75 origin-left"
                  />
                  <span className="text-xs text-muted-foreground">Impacts FAR</span>
                </label>

                {/* Impacts Occupancy — all types can toggle this */}
                <label className={`flex items-center gap-1.5 cursor-pointer ${excluded ? "text-destructive" : ""}`}>
                  <Switch
                    checked={impactsOcc}
                    onCheckedChange={(v) => onUpdate(space.id, { impactsOccupancy: v })}
                    className="scale-75 origin-left"
                  />
                  <span className={`text-xs ${excluded ? "text-destructive" : "text-muted-foreground"}`}>
                    Impacts Occ
                  </span>
                </label>
              </div>

              {/* Row 3: Calc preview + actions + type */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {/* Left: calc preview */}
                <p className="font-mono text-[10px] text-muted-foreground self-center">
                  {excluded ? (
                    <span className="text-destructive/70">excluded from calc</span>
                  ) : (
                    <>
                      {space.squareFeet} ÷ {IBC_LOAD_FACTORS[space.type]} ={" "}
                      <span className="text-primary font-semibold">
                        {Math.ceil(space.squareFeet / IBC_LOAD_FACTORS[space.type])} occ
                      </span>
                    </>
                  )}
                </p>
                {/* Right: actions */}
                <div className="flex items-center justify-end gap-0.5">
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7"
                    onClick={() => onDuplicate(space.id)}
                    title="Duplicate"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7"
                    onClick={() => onRemove(space.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
                {/* Type select spans full width */}
                <div className="col-span-2">
                  <Select
                    value={space.type}
                    onValueChange={(v) => {
                      const nonRoom = isNonRoomType(v as SpaceType)
                      onUpdate(space.id, {
                        type: v as SpaceType,
                        // Auto-clear conditioned + FAR when switching to a non-room type
                        ...(nonRoom ? { isConditioned: false, impactsFAR: false } : {}),
                      })
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(IBC_LOAD_FACTORS).map((type) => (
                        <SelectItem key={type} value={type} className="text-xs">
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
