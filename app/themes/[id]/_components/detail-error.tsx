/** 에러 상태 UI */
import Link from 'next/link'

export function DetailError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 font-mono mb-2">테마를 찾을 수 없어요</p>
        <p className="text-slate-500 text-sm mb-4">{message}</p>
        <Link href="/themes" className="text-emerald-400 hover:text-emerald-300 text-sm font-mono">
          ← 목록으로 돌아가기
        </Link>
      </div>
    </div>
  )
}

export default DetailError
