/**
 * 빈 상태 컴포넌트
 *
 * 뉴스레터가 선택되지 않았거나 데이터가 없을 때 표시됩니다.
 */

import { Calendar } from 'lucide-react';

interface EmptyStateProps {
  /** 사용 가능한 뉴스레터 날짜 개수 */
  availableDatesCount: number;
}

function EmptyState({ availableDatesCount }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-12 text-center shadow-2xl">
      <Calendar
        className="mx-auto mb-6 h-12 w-12 sm:h-16 sm:w-16 text-slate-600"
        aria-hidden="true"
      />
      <h2 className="mb-3 text-2xl font-bold text-white">
        날짜를 선택해주세요
      </h2>
      <p className="text-slate-300 leading-relaxed">
        {availableDatesCount > 0
          ? '캘린더에서 날짜를 선택하면 해당 날짜의 뉴스레터를 확인할 수 있습니다'
          : '아직 발송된 뉴스레터가 없습니다'}
      </p>
    </div>
  );
}

export default EmptyState;