'use client'

import { useState, useEffect, useRef } from 'react'

interface StockData {
  name: string
  ticker: string
  price: number
  change: number
  changePct: number
  volume: number
  market: string
  currency: string
}

interface HistoryItem {
  id: number
  ticker: string
  name: string
  price: number
  price_change: number
  price_change_pct: number
  currency: string
  searched_at: string
}

export default function Home() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<StockData | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadHistory()
    inputRef.current?.focus()
  }, [])

  async function loadHistory() {
    try {
      const res = await fetch('/api/history')
      if (res.ok) setHistory(await res.json())
    } catch {}
  }

  async function search(override?: string) {
    const q = (override ?? query).trim()
    if (!q) { setError('종목 코드 또는 티커를 입력하세요.'); return }
    if (override) setQuery(override)
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`/api/stock?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) setError(data.error ?? '오류가 발생했습니다.')
      else { setResult(data); loadHistory() }
    } catch {
      setError('서버 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function fmtPrice(price: number, currency: string) {
    return currency === 'KRW'
      ? `₩${price.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`
      : `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function fmtChange(change: number, pct: number, currency: string) {
    const arrow = change >= 0 ? '▲' : '▼'
    const sign = change >= 0 ? '+' : ''
    const ch = currency === 'KRW'
      ? change.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
      : change.toFixed(2)
    return `${arrow} ${sign}${ch} (${sign}${pct.toFixed(2)}%)`
  }

  function toOriginalQuery(ticker: string) {
    return ticker.replace(/\.(KS|KQ)$/, '')
  }

  return (
    <main className="min-h-screen bg-[#1e1e2e] text-[#cdd6f4] flex flex-col items-center pt-14 px-4 pb-16">
      <h1 className="text-3xl font-bold text-[#cba6f7] mb-8 tracking-tight">주가 조회</h1>

      <div className="w-full max-w-md space-y-4">
        {/* 검색 */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            className="flex-1 bg-[#2a2a3e] text-[#cdd6f4] placeholder-[#6c7086] rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#cba6f7] transition-all"
            placeholder="삼성전자 / 005930 / AAPL"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
          />
          <button
            className="bg-[#cba6f7] text-[#1e1e2e] font-bold px-6 py-3 rounded-xl hover:bg-[#89b4fa] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => search()}
            disabled={loading}
          >
            {loading ? '…' : '조회'}
          </button>
        </div>

        <p className="text-[#6c7086] text-xs text-center">
          한국: 종목명 (삼성전자) 또는 코드 (005930)&nbsp;·&nbsp;미국: 티커 (AAPL)
        </p>

        {error && (
          <div className="bg-[#2a2a3e] border border-[#f38ba8]/30 rounded-xl px-4 py-3 text-[#f38ba8] text-sm">
            {error}
          </div>
        )}

        {/* 결과 카드 */}
        {result && (
          <div className="bg-[#2a2a3e] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[#cba6f7] font-bold text-lg leading-tight">{result.name}</p>
                <p className="text-[#6c7086] text-xs mt-1">{result.ticker} · {result.market}</p>
              </div>
              <span className="text-[#6c7086] text-xs bg-[#1e1e2e] px-2 py-1 rounded-lg shrink-0">
                {result.currency}
              </span>
            </div>
            <div className="border-t border-[#6c7086]/20 pt-4 space-y-2.5">
              <Row label="현재가" value={fmtPrice(result.price, result.currency)} valueClass="text-[#cdd6f4] font-semibold text-base" />
              <Row
                label="전일대비"
                value={fmtChange(result.change, result.changePct, result.currency)}
                valueClass={result.change >= 0 ? 'text-[#f38ba8]' : 'text-[#89b4fa]'}
              />
              <Row label="거래량" value={result.volume.toLocaleString()} />
            </div>
          </div>
        )}

        {/* 최근 조회 */}
        {history.length > 0 && (
          <div className="bg-[#2a2a3e] rounded-2xl p-4">
            <p className="text-[#6c7086] text-xs font-medium uppercase tracking-wider mb-3">최근 조회</p>
            <div className="space-y-0.5">
              {history.map(item => (
                <button
                  key={item.id}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-[#1e1e2e] transition-colors text-left"
                  onClick={() => search(toOriginalQuery(item.ticker))}
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-[#cdd6f4] truncate">{item.name}</span>
                    <span className="text-xs text-[#6c7086] ml-2">{item.ticker}</span>
                  </div>
                  <span className={`text-xs shrink-0 ml-2 ${(item.price_change ?? 0) >= 0 ? 'text-[#f38ba8]' : 'text-[#89b4fa]'}`}>
                    {(item.price_change ?? 0) >= 0 ? '+' : ''}{(item.price_change_pct ?? 0).toFixed(2)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function Row({ label, value, valueClass = 'text-[#cdd6f4]' }: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#6c7086] text-sm">{label}</span>
      <span className={`text-sm ${valueClass}`}>{value}</span>
    </div>
  )
}
