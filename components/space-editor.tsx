"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, Plus, Copy, Ban } from "lucide-react"
import { IBC_LOAD_FACTORS, type SpaceType, type SpaceArea } from "@/lib/types"

interface SpaceEditorProps {
  spaces: SpaceArea[]
  onAdd: () => void
  onDuplicate: (id: string) => void
  onUpdate: (id: string, updates: Partial<SpaceArea>) => void
  onRemove: (id: string) => void
}

export function SpaceEditor({ spaces, onAdd, onDuplicate, onUpdate, onRemove }: SpaceEditorProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Space Definitions
        </p>
        <Button onClick={onAdd} size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" />
          Add Space
        </Button>
      </div>

      <div className="divide-y divide-border/40">
        {spaces.map((space) => {
          const excluded = space.excludeFromOccupancy ?? false
          return (
            <div key={space.id} className={`px-4 py-3 space-y-2 ${excluded ? "opacity-60" : ""}`}>
              {/* Name + conditioned toggle + actions */}
              <div className="flex items-center gap-2">
                <Input
                  value={space.name}
                  onChange={(e) => onUpdate(space.id, { name: e.target.value })}
                  className={`h-7 flex-1 text-sm font-medium ${excluded ? "line-through text-muted-foreground" : ""}`}
                />
                <Switch
                  checked={space.isConditioned}
                  onCheckedChange={(v) => onUpdate(space.id, { isConditioned: v })}
                  className="scale-75 shrink-0"
                  title="Conditioned space"
                />
                <button
                  onClick={() => onUpdate(space.id, { excludeFromOccupancy: !excluded })}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    excluded
                      ? "border-destructive/60 bg-destructive/10 text-destructive"
                      : "border-border/60 text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                  }`}
                  title={excluded ? "Re-include in occupancy" : "Exclude from occupancy"}
                >
                  <Ban className="h-3 w-3" />
                </button>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => onDuplicate(space.id)}
                  title="Duplicate"
                >
                  <Copy className="h-3 w-3 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => onRemove(space.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>

              {/* Type + SF */}
              <div className="grid grid-cols-[1fr,88px] gap-2">
                <Select
                  value={space.type}
                  onValueChange={(v) => onUpdate(space.id, { type: v as SpaceType })}
                >
                  <SelectTrigger className="h-8 text-xs">
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

                <Input
                  type="number"
                  value={space.squareFeet}
                  onChange={(e) => onUpdate(space.id, { squareFeet: Number(e.target.value) })}
                  className="h-8 text-right text-sm tabular-nums"
                  placeholder="SF"
                />
              </div>

              {/* Preview */}
              <p className="text-right font-mono text-[10px] text-muted-foreground">
                {excluded ? (
                  <span className="text-destructive/70">excluded from calc</span>
                ) : (
                  <>
                    {space.squareFeet} ÷ {IBC_LOAD_FACTORS[space.type]} ={" "}
                    <span className="text-amber-500 font-semibold">
                      {Math.ceil(space.squareFeet / IBC_LOAD_FACTORS[space.type])} occ
                    </span>
                  </>
                )}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
