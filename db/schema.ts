import { pgTable, text, boolean, jsonb, timestamp, serial } from "drizzle-orm/pg-core"
import type { AppState } from "@/lib/types"

export const versions = pgTable("versions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  state: jsonb("state").notNull().$type<AppState>(),
  isAuto: boolean("is_auto").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type Version = typeof versions.$inferSelect
export type InsertVersion = typeof versions.$inferInsert
