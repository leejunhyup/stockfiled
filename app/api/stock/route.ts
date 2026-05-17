import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from 'yahoo-finance2'
import { neon } from '@neondatabase/serverless'

function isKrCode(q: string) {
  return /^\d{6}$/.test(q)
}

async function fetchQuote(q: string) {
  const opts = { validateResult: false } as const
  if (isKrCode(q)) {
    try {
      return await yahooFinance.quote(`${q}.KS`, {}, opts)
    } catch {
      return await yahooFinance.quote(`${q}.KQ`, {}, opts)
    }
  }
  return yahooFinance.quote(q.toUpperCase(), {}, opts)
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS search_history (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(20) NOT NULL,
    name VARCHAR(100),
    price DECIMAL(15,4),
    price_change DECIMAL(15,4),
    price_change_pct DECIMAL(8,4),
    volume BIGINT,
    market VARCHAR(20),
    currency VARCHAR(10),
    searched_at TIMESTAMPTZ DEFAULT NOW()
  )
`

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''

  if (!q) {
    return NextResponse.json({ error: '종목 코드를 입력하세요.' }, { status: 400 })
  }

  try {
    const quote = await fetchQuote(q)

    if (!quote?.regularMarketPrice) {
      return NextResponse.json({ error: `'${q}' 종목을 찾을 수 없습니다.` }, { status: 404 })
    }

    const price = quote.regularMarketPrice
    const prevClose = quote.regularMarketPreviousClose ?? price
    const change = price - prevClose
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0
    const ticker = isKrCode(q) ? `${q}.KS` : q.toUpperCase()

    const data = {
      name: quote.longName ?? quote.shortName ?? ticker,
      ticker,
      price,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      volume: quote.regularMarketVolume ?? 0,
      market: quote.fullExchangeName ?? quote.exchange ?? 'N/A',
      currency: quote.currency ?? 'USD',
    }

    if (process.env.DATABASE_URL) {
      try {
        const sql = neon(process.env.DATABASE_URL)
        await sql(CREATE_TABLE)
        await sql`
          INSERT INTO search_history (ticker, name, price, price_change, price_change_pct, volume, market, currency)
          VALUES (${data.ticker}, ${data.name}, ${data.price}, ${data.change}, ${data.changePct}, ${data.volume}, ${data.market}, ${data.currency})
        `
      } catch (e) {
        console.error('DB error:', e)
      }
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: `'${q}' 종목을 찾을 수 없습니다.` }, { status: 404 })
  }
}
