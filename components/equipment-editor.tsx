"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Trash2, Plus } from "lucide-react"
import type { EquipmentItem } from "@/lib/types"

interface EquipmentEditorProps {
  equipment: EquipmentItem[]
  computedShared: Record<string, number>
  totalEquipmentSpace: number
  totalGymSF: number
  equipmentFitsInGym: boolean
  onAdd: () => void
  onUpdate: (id: string, updates: Partial<EquipmentItem>) => void
  onRemove: (id: string) => void
}

export function EquipmentEditor({
  equipment,
  computedShared,
  totalEquipmentSpace,
  totalGymSF,
  equipmentFitsInGym,
  onAdd,
  onUpdate,
  onRemove,
}: EquipmentEditorProps) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label-eyebrow">Equipment</span>
        <div className="flex items-center gap-2">
          <span className="label-eyebrow">
            {totalEquipmentSpace} sf
            {totalGymSF > 0 && (
              <span className={equipmentFitsInGym ? " text-primary" : " text-destructive"}>
                {" "}· {equipmentFitsInGym ? "fits" : "exceeds"} {totalGymSF} sf
              </span>
            )}
          </span>
          <Button onClick={onAdd} size="sm" variant="outline" className="h-7 gap-1 text-xs">
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {equipment.map((item) => {
          const shared = computedShared[item.id] ?? 0
          const total = (item.footprint + item.accessSpace) * item.quantity - shared

          return (
            <div key={item.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={item.name}
                  onChange={(e) => onUpdate(item.id, { name: e.target.value })}
                  className="h-7 flex-1 text-sm font-medium"
                />
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {total} SF
                </span>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => onRemove(item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {/* Equip SF */}
                <div>
                  <Label className="text-xs text-muted-foreground">Equip SF</Label>
                  <Input type="number" value={item.footprint} min={0}
                    onChange={(e) => onUpdate(item.id, { footprint: Number(e.target.value) })}
                    className="mt-0.5 h-7 text-xs" />
                </div>
                {/* Access SF */}
                <div>
                  <Label className="text-xs text-muted-foreground">Access SF</Label>
                  <Input type="number" value={item.accessSpace} min={0}
                    onChange={(e) => onUpdate(item.id, { accessSpace: Number(e.target.value) })}
                    className="mt-0.5 h-7 text-xs" />
                </div>
                {/* Shared — read-only, canvas-derived */}
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Shared <span className="text-[10px] opacity-60">(canvas)</span>
                  </Label>
                  <div className="mt-0.5 flex h-7 items-center rounded-md border border-border/40 bg-muted/30 px-2">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{shared}</span>
                  </div>
                </div>
                {/* Qty */}
                <div>
                  <Label className="text-xs text-muted-foreground">Qty</Label>
                  <Input type="number" value={item.quantity} min={1}
                    onChange={(e) => onUpdate(item.id, { quantity: Number(e.target.value) })}
                    className="mt-0.5 h-7 text-xs" />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
