export const IBC_LOAD_FACTORS = {
  "Swimming Pool (Water Surface)": 50,
  "Pool Deck": 15,
  "Exercise Room (Equipment)": 50,
  "Exercise Room (Concentrated)": 15,
  "Locker Room": 50,
  "Sauna/Steam Room": 50,
  "Spa/Hot Tub (Water Surface)": 50,
  "Cold Plunge (Water Surface)": 50,
  "Lobby/Reception": 15,
  "Restroom": 2,
  "Circulation": 15,
  "Lounge/Seating Area": 15,
  "Storage": 300,
  "Mechanical": 300,
  "Office": 100,
} as const

export type SpaceType = keyof typeof IBC_LOAD_FACTORS
export const SPACE_TYPES = Object.keys(IBC_LOAD_FACTORS) as SpaceType[]

export interface SpaceArea {
  id: string
  name: string
  type: SpaceType
  squareFeet: number
  isConditioned: boolean
  excludeFromOccupancy?: boolean
}

export interface EquipmentItem {
  id: string
  name: string
  footprint: number
  accessSpace: number
  sharedClearance?: number
  quantity: number
}

/** Spatial position and dimensions of a space on the floor-plan canvas (in feet). */
export interface SpaceLayout {
  x: number
  y: number
  w: number
  h: number
}

export interface AppState {
  spaces: SpaceArea[]
  equipment: EquipmentItem[]
  unconditionedLimit: number
  maxOccupants?: number
  farCap?: number
  /** Canvas layouts keyed by SpaceArea.id — SF = w × h */
  spaceLayouts: Record<string, SpaceLayout>
  /** Facility boundary — spaces outside do not count toward occupancy */
  enclosure?: SpaceLayout
  plannerLayout?: {
    equipmentPositions: Record<string, { x: number; y: number }>
    equipmentSizes?: Record<string, { w: number; h: number; clearW: number; clearH: number }>
  }
}

export function rectsOverlap(a: SpaceLayout, b: SpaceLayout): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y
}

export const WC_THRESHOLDS: Array<{ max: number; total: number; accessible: number }> = [
  { max: 40,  total: 1, accessible: 1 },
  { max: 80,  total: 2, accessible: 1 },
  { max: 120, total: 3, accessible: 2 },
  { max: 160, total: 4, accessible: 2 },
  { max: 200, total: 5, accessible: 3 },
]

export const LAV_THRESHOLDS: Array<{ max: number; count: number }> = [
  { max: 150, count: 1 },
  { max: 300, count: 2 },
  { max: Infinity, count: 3 },
]

export function getWCRequirements(occupancy: number) {
  const tier = WC_THRESHOLDS.find((t) => occupancy <= t.max) ?? {
    total: Math.ceil(occupancy / 40),
    accessible: Math.ceil(Math.ceil(occupancy / 40) / 2),
  }
  return {
    total: tier.total,
    accessible: tier.accessible,
    nonAccessible: tier.total - tier.accessible,
  }
}

export function getLavatoryCount(occupancy: number): number {
  return LAV_THRESHOLDS.find((t) => occupancy <= t.max)?.count ?? 3
}
