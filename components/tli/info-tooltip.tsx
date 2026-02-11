'use client'

import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface InfoTooltipProps {
  content: string
  iconClassName?: string
}

export default function InfoTooltip({ content, iconClassName }: InfoTooltipProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn('inline-flex text-slate-500 hover:text-slate-400 transition-colors', iconClassName)}
            aria-label="도움말"
          >
            <HelpCircle className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] py-2 border border-slate-700/50 rounded-lg font-mono leading-relaxed shadow-lg">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}