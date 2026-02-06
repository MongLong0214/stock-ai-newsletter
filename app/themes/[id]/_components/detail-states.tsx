import Link from 'next/link'

/** 로딩 상태 UI */
export function DetailLoading() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="animate-pulse text-emerald-500 font-mono">Loading Theme Data...</div>
    </div>
  )
}

/** 에러 상태 UI */
export function DetailError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 font-mono mb-2">테마를 찾을 수 없습니다</p>
        <p className="text-slate-500 text-sm mb-4">{message}</p>
        <Link href="/themes" className="text-emerald-400 hover:text-emerald-300 text-sm font-mono">
          ← 목록으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
