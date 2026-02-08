'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { STAGE_CONFIG, type DisplayStage } from '@/lib/tli/types'
import { cn } from '@/lib/utils'

interface StageNavProps {
  sections: {
    key: string
    stage: DisplayStage
    title: string
    count: number
  }[]
}

function StageNav({ sections }: StageNavProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const activePillRef = useRef<HTMLButtonElement>(null)

  // Scroll spy with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        const topmost = visible.reduce((prev, cur) =>
          prev.boundingClientRect.top < cur.boundingClientRect.top ? prev : cur
        )
        setActiveSection(topmost.target.id.replace('stage-', ''))
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    )

    sections.forEach(({ key }) => {
      const el = document.getElementById(`stage-${key}`)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [sections])

  // Auto-scroll active pill into view on mobile
  useEffect(() => {
    if (activePillRef.current && navRef.current) {
      const pill = activePillRef.current
      const nav = navRef.current
      const navRect = nav.getBoundingClientRect()
      const pillRect = pill.getBoundingClientRect()

      if (pillRect.left < navRect.left + 16 || pillRect.right > navRect.right - 16) {
        pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [activeSection])

  const scrollToSection = useCallback((key: string) => {
    const el = document.getElementById(`stage-${key}`)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 80
    window.scrollTo({ top, behavior: 'smooth' })
  }, [])

  if (sections.length === 0) return null

  return (
    <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 mb-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="bg-black/80 backdrop-blur-xl border-b border-white/5"
      >
        <nav
          ref={navRef}
          role="tablist"
          aria-label="테마 생명주기 단계 탐색"
          className="flex flex-wrap sm:flex-nowrap gap-1.5 sm:gap-2 sm:overflow-x-auto sm:scroll-smooth px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {sections.map(({ key, stage, title, count }) => {
            const config = STAGE_CONFIG[stage]
            const isActive = activeSection === key

            return (
              <button
                key={key}
                ref={isActive ? activePillRef : null}
                role="tab"
                aria-selected={isActive}
                aria-controls={`stage-${key}`}
                onClick={() => scrollToSection(key)}
                className={cn(
                  'cursor-pointer group relative flex items-center gap-1.5 sm:gap-2 rounded-lg sm:shrink-0',
                  'px-2.5 py-1.5 sm:px-3.5 sm:py-2',
                  'text-xs sm:text-sm border',
                  'transition-all duration-200',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
                  !isActive && 'bg-slate-900/40 border-slate-700/30 hover:bg-slate-800/60 hover:border-slate-600/50',
                )}
                style={
                  isActive
                    ? {
                        backgroundImage: `linear-gradient(to bottom right, ${config.color}15, ${config.color}08)`,
                        borderColor: `${config.color}30`,
                        boxShadow: `0 0 16px ${config.color}15`,
                      }
                    : {}
                }
              >
                <div
                  className={cn(
                    'w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-200 shrink-0',
                    isActive ? 'scale-110' : 'scale-100'
                  )}
                  style={{
                    backgroundColor: config.color,
                    boxShadow: isActive ? `0 0 6px ${config.color}70` : 'none',
                  }}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'font-medium tracking-tight transition-colors duration-200 whitespace-nowrap',
                    isActive ? 'text-white' : 'text-slate-400'
                  )}
                >
                  {title}
                </span>
                <span
                  className={cn(
                    'font-mono text-[10px] sm:text-xs font-semibold tabular-nums transition-all duration-200',
                    isActive ? 'text-white/80' : 'text-slate-600'
                  )}
                  style={isActive ? { color: `${config.color}cc` } : {}}
                  aria-label={`${count}개 테마`}
                >
                  {count}
                </span>
              </button>
            )
          })}
          <div className="hidden sm:block shrink-0 w-px" aria-hidden="true" />
        </nav>
      </motion.div>
    </div>
  )
}

export default StageNav
