'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface KeywordTagsProps {
  keywords: string[]
}

/** 키워드 태그 pill 컴포넌트 */
function KeywordTags({ keywords }: KeywordTagsProps) {
  if (!keywords || keywords.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="flex flex-wrap gap-2"
    >
      {keywords.map((keyword, idx) => (
        <motion.span
          key={`${keyword}-${idx}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 + idx * 0.04 }}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full',
            'text-xs font-mono',
            'bg-slate-800/60 border border-slate-700/40',
            'text-slate-300 hover:text-white hover:border-emerald-500/30',
            'transition-colors cursor-default'
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
          {keyword}
        </motion.span>
      ))}
    </motion.div>
  )
}

export default KeywordTags
