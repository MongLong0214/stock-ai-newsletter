/**
 * 검색 결과 없음 상태 컴포넌트
 */

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24" role="status" aria-label="검색 결과 없음">
      {/* 아이콘 영역 */}
      <div className="relative">
        {/* 글로우 효과 */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 rounded-full blur-3xl animate-pulse" />

        {/* 아이콘 컨테이너 */}
        <div className="relative p-6 rounded-3xl bg-gray-900/50 border border-gray-800/50 backdrop-blur-sm">
          <svg className="w-16 h-16 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="mt-6 text-center space-y-2">
        <h3 className="text-lg font-semibold text-gray-300">검색 결과가 없습니다</h3>
        <p className="text-sm text-gray-500">다른 키워드나 태그로 시도해보세요</p>
      </div>
    </div>
  );
}