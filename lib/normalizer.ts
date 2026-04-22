import { z } from "zod"
import { SPACE_TYPES, type AppState, type SpaceArea, type SpaceType, type EquipmentItem } from "./types"

function fuzzyMatchSpaceType(raw: string): SpaceType {
  const n = raw.toLowerCase()
  const ALIASES: Array<[string, SpaceType]> = [
    ["swimming pool", "Swimming Pool (Water Surface)"],
    ["pool water", "Swimming Pool (Water Surface)"],
    ["pool deck", "Pool Deck"],
    ["deck", "Pool Deck"],
    ["exercise room (equipment)", "Exercise Room (Equipment)"],
    ["exercise equipment", "Exercise Room (Equipment)"],
    ["gym equipment", "Exercise Room (Equipment)"],
    ["exercise room (concentrated)", "Exercise Room (Concentrated)"],
    ["exercise concentrated", "Exercise Room (Concentrated)"],
    ["locker room", "Locker Room"],
    ["locker", "Locker Room"],
    ["sauna/steam", "Sauna/Steam Room"],
    ["sauna", "Sauna/Steam Room"],
    ["steam", "Sauna/Steam Room"],
    ["spa/hot tub", "Spa/Hot Tub (Water Surface)"],
    ["hot tub", "Spa/Hot Tub (Water Surface)"],
    ["spa", "Spa/Hot Tub (Water Surface)"],
    ["cold plunge", "Cold Plunge (Water Surface)"],
    ["plunge", "Cold Plunge (Water Surface)"],
    ["lobby", "Lobby/Reception"],
    ["reception", "Lobby/Reception"],
    ["restroom", "Restroom"],
    ["bathroom", "Restroom"],
    ["bath", "Restroom"],
    ["toilet", "Restroom"],
    ["wc", "Restroom"],
    ["circulation", "Circulation"],
    ["corridor", "Circulation"],
    ["hallway", "Circulation"],
    ["lounge", "Lounge/Seating Area"],
    ["seating", "Lounge/Seating Area"],
    ["storage", "Storage"],
    ["mechanical", "Mechanical"],
    ["office", "Office"],
  ]
  for (const [alias, canonical] of ALIASES) {
    if (n.includes(alias)) return canonical
  }
  const partial = SPACE_TYPES.find((t) => t.toLowerCase().includes(n))
  return partial ?? "Pool Deck"
}

const SpaceRawSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().default("Unnamed Space"),
    type: z.string().default("Pool Deck"),
    squareFeet: z.coerce.number().min(0).optional(),
    square_feet: z.coerce.number().min(0).optional(),
    area: z.coerce.number().min(0).optional(),
    isConditioned: z.boolean().optional(),
    is_conditioned: z.boolean().optional(),
  })
  .passthrough()

const EquipmentRawSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().default("New Equipment"),
    footprint: z.coerce.number().min(0).optional(),
    equip_area: z.coerce.number().min(0).optional(),
    accessSpace: z.coerce.number().min(0).optional(),
    access_space: z.coerce.number().min(0).optional(),
    area_with_clearance: z.coerce.number().min(0).optional(),
    quantity: z.coerce.number().min(1).default(1),
    qty: z.coerce.number().min(1).optional(),
  })
  .passthrough()

const AppStateRawSchema = z
  .object({
    spaces: z.array(SpaceRawSchema).default([]),
    equipment: z.array(EquipmentRawSchema).default([]),
    unconditionedLimit: z.coerce.number().min(0).optional(),
    unconditioned_limit: z.coerce.number().min(0).optional(),
    maxOccupants: z.coerce.number().min(0).optional(),
    max_occupants: z.coerce.number().min(0).optional(),
    farCap: z.coerce.number().min(0).optional(),
    far_cap: z.coerce.number().min(0).optional(),
  })
  .passthrough()

export type NormalizeResult =
  | { success: true; state: AppState }
  | { success: false; errors: string[] }

export function normalizeImportedJson(raw: unknown): NormalizeResult {
  const parsed = AppStateRawSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.issues.map((i) => i.message) }
  }
  const d = parsed.data

  const spaces: SpaceArea[] = d.spaces.map((s) => {
    const squareFeet = s.squareFeet ?? s.square_feet ?? s.area ?? 0
    const isConditioned = s.isConditioned ?? s.is_conditioned ?? true
    const rawType = s.type ?? "Pool Deck"
    const type: SpaceType = SPACE_TYPES.includes(rawType as SpaceType)
      ? (rawType as SpaceType)
      : fuzzyMatchSpaceType(rawType)
    return {
      id: s.id && s.id !== "auto" ? s.id : crypto.randomUUID(),
      name: s.name,
      type,
      squareFeet,
      isConditioned,
    }
  })

  const equipment: EquipmentItem[] = d.equipment.map((e) => {
    const qty = e.quantity ?? e.qty ?? 1
    // If equip_area + area_with_clearance provided, derive footprint + accessSpace
    const equipArea = e.footprint ?? e.equip_area
    const totalArea = e.area_with_clearance
    // accessSpace stores total area incl. clearance; footprint fits within it
    let footprint = equipArea ?? 15
    let accessSpace = e.accessSpace ?? e.access_space ?? footprint
    if (totalArea !== undefined) {
      accessSpace = totalArea
      if (equipArea !== undefined) footprint = equipArea
    }
    return {
      id: e.id && e.id !== "auto" ? e.id : crypto.randomUUID(),
      name: e.name,
      footprint,
      accessSpace,
      quantity: qty,
    }
  })

  return {
    success: true,
    state: {
      spaces,
      equipment,
      unconditionedLimit: d.unconditionedLimit ?? d.unconditioned_limit ?? 500,
      maxOccupants: d.maxOccupants ?? d.max_occupants,
      farCap: d.farCap ?? d.far_cap,
    },
  }
}
