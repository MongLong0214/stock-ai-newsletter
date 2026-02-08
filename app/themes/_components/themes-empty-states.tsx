import { motion } from 'framer-motion'
import { SearchX } from 'lucide-react'

/** 에러 UI 컴포넌트 */
export function ThemesError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 font-mono mb-2">데이터 로딩 실패</p>
        <p className="text-slate-500 text-sm">{message}</p>
      </div>
    </div>
  )
}

/** 빈 검색 결과 UI */
export function EmptySearchResult({ query }: { query: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-20"
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-6">
        <SearchX className="w-8 h-8 text-slate-500" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">검색 결과 없음</h3>
      <p className="text-sm text-slate-500 text-center max-w-sm">
        &ldquo;{query}&rdquo;에 대한 결과를 찾을 수 없습니다.
        <br />
        다른 키워드로 검색하거나 필터를 조정해 보세요.
      </p>
    </motion.div>
  )
}
