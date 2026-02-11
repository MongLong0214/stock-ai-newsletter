'use client'

import { useMemo, useState, useEffect } from 'react'
import { Newspaper, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'
import { analyzeSentiment, getSentimentConfig } from '@/lib/tli/sentiment'

interface NewsArticle {
  title: string
  link: string
  source: string | null
  pubDate: string
  sentimentScore?: number | null
}

interface NewsHeadlinesProps {
  articles: NewsArticle[]
}

/** HTML 태그 제거 + 엔티티 디코딩 */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
}

/** URL 프로토콜 검증 (XSS 방지) */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return url
    }
    return '#'
  } catch {
    return '#'
  }
}

/** 상대 시간 포맷: "2시간 전", "3일 전" 등 (클라이언트 전용) */
function formatRelativeDate(dateStr: string, now: number): string {
  const date = new Date(dateStr).getTime()
  const diffMs = now - date

  if (isNaN(diffMs) || diffMs < 0) return '방금'

  const minutes = Math.floor(diffMs / 60_000)
  const hours = Math.floor(diffMs / 3_600_000)
  const days = Math.floor(diffMs / 86_400_000)

  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  if (hours < 24) return `${hours}시간 전`
  if (days < 30) return `${days}일 전`
  return `${Math.floor(days / 30)}개월 전`
}

/** 날짜 폴백: 서버에서는 절대 날짜, 클라이언트에서는 상대 시간 */
function formatDateFallback(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

/** 관련 뉴스 헤드라인 컴포넌트 */
function NewsHeadlines({ articles }: NewsHeadlinesProps) {
  // 클라이언트 마운트 후에만 상대 시간 표시 (hydration mismatch 방지)
  const [clientNow, setClientNow] = useState<number | null>(null)
  useEffect(() => {
    setClientNow(Date.now())
  }, [])

  const sorted = useMemo(() => {
    return [...articles]
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
  }, [articles])

  const sentimentMap = useMemo(() => {
    const map = new Map<string, number>()
    sorted.forEach(a => {
      const score = a.sentimentScore ?? analyzeSentiment(a.title).score
      map.set(a.link, score)
    })
    return map
  }, [sorted])

  const sentimentSummary = useMemo(() => {
    const scores = Array.from(sentimentMap.values())
    const avg = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0
    const config = getSentimentConfig(avg)
    return { avg, config, count: scores.length }
  }, [sentimentMap])

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Newspaper className="w-8 h-8 text-slate-700" />
        <p className="text-sm text-slate-500 font-mono">뉴스 데이터 수집 중</p>
      </div>
    )
  }

  return (
    <div>
      {/* 전체 기사 논조 요약 */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 mb-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
        <span className="text-xs font-mono text-slate-500">기사 논조</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono px-2 py-0.5 rounded ${sentimentSummary.config.bg} border ${sentimentSummary.config.border} ${sentimentSummary.config.text}`}>
            {sentimentSummary.config.label}
          </span>
          <span className="text-[11px] font-mono text-slate-600">
            ({sentimentSummary.avg.toFixed(2)})
          </span>
        </div>
      </div>

      {/* 기사 목록 */}
      <div className="divide-y divide-slate-800/60">
      {sorted.map((article, idx) => {
        const score = sentimentMap.get(article.link) ?? 0
        const config = getSentimentConfig(score)

        return (
          <motion.a
            key={article.link}
            href={sanitizeUrl(article.link)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${stripHtml(article.title)} - ${article.source ?? '뉴스'} (새 탭에서 열기)`}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
            className="block px-3 sm:px-4 py-3 hover:bg-white/[0.03] transition-colors group"
          >
            {/* Row 1: 번호 + 제목 */}
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-mono text-slate-700 w-4 text-right flex-shrink-0 mt-0.5">
                {idx + 1}
              </span>
              <span className="flex-1 text-sm text-slate-300 group-hover:text-white transition-colors line-clamp-2 sm:line-clamp-1 min-w-0 break-keep">
                {stripHtml(article.title)}
              </span>
              <ExternalLink className="w-3 h-3 text-slate-700 group-hover:text-emerald-400 transition-colors flex-shrink-0 mt-0.5 hidden sm:block" />
            </div>

            {/* Row 2: 메타 정보 */}
            <div className="flex items-center gap-2 mt-1.5 ml-6">
              {article.source && (
                <span className="text-[10px] font-mono text-emerald-500/70 px-1.5 py-0.5 rounded bg-emerald-500/5 border border-emerald-500/10 truncate max-w-[100px]">
                  {article.source}
                </span>
              )}
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${config.bg} border ${config.border} ${config.text}`}>
                {config.label}
              </span>
              <span className="flex-1" />
              <span className="text-[11px] font-mono text-slate-600">
                {clientNow !== null
                  ? formatRelativeDate(article.pubDate, clientNow)
                  : formatDateFallback(article.pubDate)}
              </span>
            </div>
          </motion.a>
        )
      })}
      </div>
    </div>
  )
}

export default NewsHeadlines
