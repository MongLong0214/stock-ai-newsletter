'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function Disclaimer() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-slate-900/40 backdrop-blur-xl p-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-3 text-left"
      >
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-amber-400">투자 유의사항</h4>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>

          <p className="text-xs text-slate-500 mt-1">
            테마 점수는 테마의 생명주기를 나타내는 지표로, 투자 권유가 아닙니다
          </p>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-amber-500/10 space-y-3">
              <div className="text-xs text-slate-500 space-y-2">
                <p>
                  <strong className="text-slate-400">테마 점수란?</strong>
                  <br />
                  테마의 관심도, 뉴스 모멘텀, 변동성, 성숙도를 종합하여 산출한 생명주기 지수입니다.
                </p>

                <p>
                  <strong className="text-slate-400">생명주기 단계</strong>
                  <br />
                  • 초기(Early): 관심이 형성되는 단계<br />
                  • 성장(Growth): 관심이 빠르게 증가하는 단계<br />
                  • 과열(Peak): 관심이 최고조에 달한 단계<br />
                  • 말기(Decay): 관심이 감소하는 단계<br />
                  • 관심없음(Dormant): 관심이 거의 없는 단계
                </p>

                <p>
                  <strong className="text-slate-400">주의사항</strong>
                  <br />
                  • 본 지표는 과거 데이터 기반 분석 결과이며, 미래 수익을 보장하지 않습니다<br />
                  • 높은 점수가 투자 적기를 의미하지 않으며, 오히려 과열 신호일 수 있습니다<br />
                  • 투자 판단은 본인의 책임 하에 신중히 결정하시기 바랍니다<br />
                  • 본 서비스는 정보 제공 목적이며, 투자 자문이나 권유가 아닙니다
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
