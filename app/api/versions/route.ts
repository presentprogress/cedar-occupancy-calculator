import { NextResponse } from "next/server"
import { getDb } from "@/db"
import { versions } from "@/db/schema"
import { desc, sql } from "drizzle-orm"

export const runtime = "nodejs"

export async function GET() {
  const db = getDb()
  const rows = await db
    .select({
      id: versions.id,
      name: versions.name,
      isAuto: versions.isAuto,
      createdAt: versions.createdAt,
    })
    .from(versions)
    .orderBy(desc(versions.createdAt))
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const db = getDb()
  const body = await req.json()
  const [inserted] = await db
    .insert(versions)
    .values({
      name: body.name,
      state: body.state,
      isAuto: body.isAuto ?? false,
    })
    .returning({ id: versions.id, name: versions.name, createdAt: versions.createdAt })

  if (body.isAuto) {
    await db.execute(
      sql`DELETE FROM versions WHERE is_auto = true AND id NOT IN (
        SELECT id FROM versions WHERE is_auto = true ORDER BY id DESC LIMIT 20
      )`
    )
  }

  return NextResponse.json(inserted, { status: 201 })
}
