import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '주가 조회',
  description: '한국·미국 주식 실시간 조회',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
