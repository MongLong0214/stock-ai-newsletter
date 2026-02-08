'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import ThemeCard from '@/components/tli/theme-card'
import { STAGE_CONFIG, type ThemeListItem, type Stage } from '@/lib/tli/types'
import { cn } from '@/lib/utils'

interface StageSectionProps {
  stage: Stage
  title: string
  subtitle: string
  themes: ThemeListItem[]
  index: number
  sectionKey: string
}

const PAGE_SIZE = 9

function StageSection({ stage, title, subtitle, themes, sectionKey }: StageSectionProps) {
  const config = STAGE_CONFIG[stage]
  const [collapsed, setCollapsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    if (collapsed) setVisibleCount(PAGE_SIZE)
  }, [collapsed])

  const visible = themes.slice(0, visibleCount)
  const remaining = themes.length - visibleCount

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      id={`stage-${sectionKey}`}
      className={cn('scroll-mt-20 rounded-2xl border border-emerald-500/10 bg-slate-900/30 p-4 sm:p-5', collapsed ? 'mb-4' : 'mb-10')}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className={cn(
          'w-full flex items-start gap-3 cursor-pointer rounded-xl p-3 mb-0',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
          'hover:bg-slate-800/20',
        )}
      >
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg sm:text-xl font-bold" style={{ color: config.color }}>
              {title}
            </h2>
            <span
              className="font-mono text-xs font-semibold tabular-nums"
              style={{ color: `${config.color}99` }}
            >
              {themes.length}
            </span>
          </div>
          {/* subtitle: 항상 렌더링, opacity로 전환 — 높이 변화 없음 */}
          <div
            className="grid transition-[grid-template-rows,opacity] duration-200"
            style={{
              gridTemplateRows: collapsed ? '0fr' : '1fr',
              opacity: collapsed ? 0 : 1,
            }}
          >
            <div className="overflow-hidden">
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          {/* collapsed pills: 항상 렌더링, 반대 방향으로 전환 */}
          {themes.length > 0 && (
            <div
              className="grid transition-[grid-template-rows,opacity] duration-200"
              style={{
                gridTemplateRows: collapsed ? '1fr' : '0fr',
                opacity: collapsed ? 1 : 0,
              }}
            >
              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {themes.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className="text-[11px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800/50 border border-slate-700/30 truncate max-w-[120px]"
                    >
                      {t.name}
                    </span>
                  ))}
                  {themes.length > 3 && (
                    <span className="text-[11px] text-slate-500 font-mono">
                      +{themes.length - 3}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <ChevronDown
          className={cn(
            'w-5 h-5 shrink-0 mt-0.5 text-slate-500 transition-transform duration-200',
            collapsed && '-rotate-90'
          )}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="pt-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {visible.map((theme: ThemeListItem) => (
                <ThemeCard key={theme.id} theme={theme} />
              ))}
            </div>

            {remaining > 0 && (
              <div className="mt-5 flex justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setVisibleCount((v) => Math.min(v + PAGE_SIZE, themes.length))
                  }}
                  className="cursor-pointer px-4 py-2 rounded-lg text-sm font-medium bg-slate-900/60 border transition-colors duration-150 hover:bg-slate-800/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                  style={{
                    borderColor: `${config.color}30`,
                    color: `${config.color}cc`,
                  }}
                >
                  {remaining}개 더보기
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

export default StageSection
