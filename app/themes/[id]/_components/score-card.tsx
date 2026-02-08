import { motion } from 'framer-motion'
import ScoreBreakdown from '@/components/tli/score-breakdown'
import type { ThemeDetail } from '@/lib/tli/types'

interface ScoreCardProps {
  score: ThemeDetail['score']
}

/** 점수 구성 카드 컴포넌트 */
function ScoreCard({ score }: ScoreCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6 h-full overflow-y-auto custom-scroll"
    >
      <h2 className="text-lg font-bold mb-4">
        <span className="text-white">점수</span>
        <span className="text-emerald-400 ml-1">구성</span>
      </h2>
      <ScoreBreakdown components={score.components} raw={score.raw} />

      {/* 변화 지표 */}
      <div className="flex gap-6 mt-6 pt-4 border-t border-slate-700/50">
        <div>
          <span className="text-xs text-slate-400 font-mono">24H</span>
          <div className={`text-lg font-mono font-bold ${score.change24h === 0 ? 'text-slate-500' : score.change24h > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {score.change24h === 0 ? '—' : `${score.change24h > 0 ? '+' : ''}${score.change24h.toFixed(1)}`}
          </div>
        </div>
        <div>
          <span className="text-xs text-slate-400 font-mono">7D</span>
          <div className={`text-lg font-mono font-bold ${score.change7d === 0 ? 'text-slate-500' : score.change7d > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {score.change7d === 0 ? '—' : `${score.change7d > 0 ? '+' : ''}${score.change7d.toFixed(1)}`}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default ScoreCard
