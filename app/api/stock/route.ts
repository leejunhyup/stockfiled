import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

function isKrCode(q: string) {
  return /^\d{6}$/.test(q)
}

function isKorean(q: string) {
  return /[가-힣]/.test(q)
}

async function searchKoreanTicker(name: string): Promise<string | null> {
  try {
    const url = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(name)}&q_enc=UTF-8&target=stock`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, */*',
        Referer: 'https://finance.naver.com/',
      },
    })
    if (!res.ok) return null

    const data = await res.json()
    // items: [ [kospi 항목...], [kosdaq 항목...] ]  각 항목: [종목명, 코드, 시장, ...]
    const all: string[][] = [
      ...(Array.isArray(data?.items?.[0]) ? data.items[0] : []),
      ...(Array.isArray(data?.items?.[1]) ? data.items[1] : []),
    ]
    if (!all.length) return null

    const first = all[0]
    const code = first?.[1]
    if (!code || !/^\d{6}$/.test(code)) return null

    const market = String(first?.[2] ?? '')
    const suffix = market.includes('코스닥') || market.toUpperCase().includes('KOSDAQ') ? '.KQ' : '.KS'
    return `${code}${suffix}`
  } catch {
    return null
  }
}

interface YahooMeta {
  longName?: string
  shortName?: string
  currency?: string
  exchangeName?: string
  fullExchangeName?: string
  regularMarketPrice?: number
  chartPreviousClose?: number
  previousClose?: number
  regularMarketVolume?: number
}

async function fetchYahooChart(symbol: string): Promise<YahooMeta> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
      Referer: 'https://finance.yahoo.com/',
    },
  })
  if (!res.ok) throw new Error(`Yahoo Finance ${res.status}`)
  const data = await res.json()
  if (data?.chart?.error) throw new Error(data.chart.error.description ?? 'error')
  const meta: YahooMeta = data?.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice) throw new Error('no price')
  return meta
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
  if (!q) return NextResponse.json({ error: '종목 코드를 입력하세요.' }, { status: 400 })

  let ticker: string

  if (isKrCode(q)) {
    ticker = `${q}.KS`
  } else if (isKorean(q)) {
    const found = await searchKoreanTicker(q)
    if (!found) return NextResponse.json({ error: `'${q}' 종목을 찾을 수 없습니다.` }, { status: 404 })
    ticker = found
  } else {
    ticker = q.toUpperCase()
  }

  try {
    let meta: YahooMeta
    try {
      meta = await fetchYahooChart(ticker)
    } catch {
      if (isKrCode(q)) {
        ticker = `${q}.KQ`
        meta = await fetchYahooChart(ticker)
      } else {
        throw new Error()
      }
    }

    const price = meta.regularMarketPrice!
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price
    const change = price - prevClose
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0

    const data = {
      name: meta.longName ?? meta.shortName ?? ticker,
      ticker,
      price,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      volume: meta.regularMarketVolume ?? 0,
      market: meta.fullExchangeName ?? meta.exchangeName ?? 'N/A',
      currency: meta.currency ?? 'USD',
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
