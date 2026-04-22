"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Trash2, Plus } from "lucide-react"
import type { EquipmentItem } from "@/lib/types"

interface EquipmentEditorProps {
  equipment: EquipmentItem[]
  totalEquipmentSpace: number
  totalGymSF: number
  equipmentFitsInGym: boolean
  onAdd: () => void
  onUpdate: (id: string, updates: Partial<EquipmentItem>) => void
  onRemove: (id: string) => void
}

export function EquipmentEditor({
  equipment,
  totalEquipmentSpace,
  totalGymSF,
  equipmentFitsInGym,
  onAdd,
  onUpdate,
  onRemove,
}: EquipmentEditorProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Gym Equipment
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {totalEquipmentSpace} SF total
            {totalGymSF > 0 && (
              <span className={equipmentFitsInGym ? " text-emerald-400" : " text-destructive"}>
                {" "}· {equipmentFitsInGym ? "fits in" : "exceeds"} {totalGymSF} SF gym
              </span>
            )}
          </p>
        </div>
        <Button onClick={onAdd} size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      <div className="divide-y divide-border/40">
        {equipment.map((item) => {
          const shared = item.sharedClearance ?? 0
          const total = (item.footprint + item.accessSpace) * item.quantity
            - shared * Math.max(0, item.quantity - 1)

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
                {([
                  { label: "Equip SF", key: "footprint" as const, val: item.footprint, min: 0 },
                  { label: "Access SF", key: "accessSpace" as const, val: item.accessSpace, min: 0 },
                  { label: "Shared", key: "sharedClearance" as const, val: item.sharedClearance ?? 0, min: 0 },
                  { label: "Qty", key: "quantity" as const, val: item.quantity, min: 1 },
                ] as const).map(({ label, key, val, min }) => (
                  <div key={key}>
                    <Label className="text-[10px] text-muted-foreground">{label}</Label>
                    <Input
                      type="number"
                      value={val}
                      min={min}
                      onChange={(e) => onUpdate(item.id, { [key]: Number(e.target.value) })}
                      className="mt-0.5 h-7 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
