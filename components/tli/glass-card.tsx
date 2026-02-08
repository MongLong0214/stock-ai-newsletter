/** 공통 글래스 카드 컨테이너 */
import { cn } from '@/lib/utils'
import { type ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
}

export function GlassCard({ children, className }: GlassCardProps) {
  return (
    <div className={cn('rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl', className)}>
      {children}
    </div>
  )
}
