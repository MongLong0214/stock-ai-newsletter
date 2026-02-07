'use client'

import { useMemo } from 'react'
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

/** HTML 태그 제거 */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '')
}

/** 상대 시간 포맷: "2시간 전", "3일 전" 등 */
function formatRelativeDate(dateStr: string): string {
  const now = Date.now()
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

/** 관련 뉴스 헤드라인 컴포넌트 */
function NewsHeadlines({ articles }: NewsHeadlinesProps) {
  const sorted = useMemo(() => {
    return [...articles]
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, 10)
  }, [articles])

  const sentimentSummary = useMemo(() => {
    const scores = sorted.map(a => a.sentimentScore ?? analyzeSentiment(a.title).score)
    const avg = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0
    const config = getSentimentConfig(avg)
    return { avg, config, count: scores.length }
  }, [sorted])

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
      {/* 전체 감성 요약 */}
      <div className="flex items-center justify-between px-4 py-2.5 mb-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
        <span className="text-xs font-mono text-slate-500">전체 감성</span>
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
      {sorted.map((article, idx) => (
        <motion.a
          key={`${article.link}-${idx}`}
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
          className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group"
        >
          {/* 넘버링 */}
          <span className="text-[10px] font-mono text-slate-700 w-4 text-right flex-shrink-0">
            {idx + 1}
          </span>

          {/* 제목 */}
          <span className="flex-1 text-sm text-slate-300 group-hover:text-white transition-colors line-clamp-1 min-w-0">
            {stripHtml(article.title)}
          </span>

          {/* 출처 뱃지 */}
          {article.source && (
            <span className="text-[10px] font-mono text-emerald-500/70 px-1.5 py-0.5 rounded bg-emerald-500/5 border border-emerald-500/10 flex-shrink-0 max-w-[80px] truncate">
              {article.source}
            </span>
          )}

          {/* 감성 뱃지 */}
          {(() => {
            const score = article.sentimentScore ?? analyzeSentiment(article.title).score
            const config = getSentimentConfig(score)
            return (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${config.bg} border ${config.border} ${config.text} flex-shrink-0`}>
                {config.label}
              </span>
            )
          })()}

          {/* 상대 시간 */}
          <span className="text-[11px] font-mono text-slate-600 flex-shrink-0 w-16 text-right">
            {formatRelativeDate(article.pubDate)}
          </span>

          {/* 외부 링크 */}
          <ExternalLink className="w-3 h-3 text-slate-700 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
        </motion.a>
      ))}
      </div>
    </div>
  )
}

export default NewsHeadlines
