import { NextResponse } from "next/server"
import { getDb } from "@/db"
import { versions } from "@/db/schema"
import { eq } from "drizzle-orm"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = parseInt(id, 10)
  if (isNaN(parsed)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const db = getDb()
  const [row] = await db.select().from(versions).where(eq(versions.id, parsed))
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(row)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = parseInt(id, 10)
  if (isNaN(parsed)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const db = getDb()
  await db.delete(versions).where(eq(versions.id, parsed))
  return new Response(null, { status: 204 })
}
