import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json([])

  try {
    const sql = neon(process.env.DATABASE_URL)
    const rows = await sql`
      SELECT id, ticker, name, price, price_change, price_change_pct, currency, searched_at
      FROM search_history
      ORDER BY searched_at DESC
      LIMIT 10
    `
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json([])
  }
}
