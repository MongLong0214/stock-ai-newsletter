/**
 * 태그 버튼 컴포넌트
 * - 선택/미선택 상태에 따라 다른 스타일 적용
 * - React.memo로 불필요한 리렌더 방지
 * - 500+ 태그 환경에서 최적화됨
 */
'use client';

import { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Icons } from '../shared/icons';

// ============================================================================
// 타입 정의
// ============================================================================

interface TagButtonProps {
  /** 태그 이름 */
  tag: string;
  /** 게시글 개수 */
  count: number;
  /** 선택 상태 */
  isSelected: boolean;
  /** 클릭 핸들러 - 안정적인 참조 필요 (useCallback) */
  onToggle: (tag: string) => void;
  /** 애니메이션 지연 (밀리초) - 미선택 태그 더보기 시 사용 */
  animationDelay?: number;
  /** 새로 추가된 태그 여부 (애니메이션 적용) */
  isNewlyAdded?: boolean;
}

// ============================================================================
// 컴포넌트
// ============================================================================

export const TagButton = memo(function TagButton({
  tag,
  count,
  isSelected,
  onToggle,
  animationDelay = 0,
  isNewlyAdded = false,
}: TagButtonProps) {
  // 클릭 핸들러 - tag와 onToggle이 바뀌지 않으면 동일 참조 유지
  const handleClick = useCallback(() => {
    onToggle(tag);
  }, [onToggle, tag]);

  // 키보드 이벤트 핸들러
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggle(tag);
      }
    },
    [onToggle, tag]
  );

  // --------------------------------------------------------------------------
  // 선택된 태그 스타일
  // --------------------------------------------------------------------------
  if (isSelected) {
    return (
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-pressed={true}
        aria-label={`${tag} 태그 선택 해제 (${count}개 글)`}
        className={cn(
          'group relative inline-flex items-center gap-2 pl-3 pr-2.5 py-2 text-xs font-medium rounded-xl',
          'bg-gradient-to-br from-emerald-500/20 to-emerald-400/10',
          'border border-emerald-500/40',
          'shadow-lg shadow-emerald-500/10',
          'hover:shadow-emerald-500/20 hover:border-emerald-500/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
          'transition-all duration-300 ease-out',
          'hover:-translate-y-0.5'
        )}
      >
        <span className="text-emerald-400">#{tag}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-emerald-400/70 tabular-nums">
            {count}
          </span>
          <div className="p-0.5 rounded bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors">
            <Icons.Close className="w-2.5 h-2.5 text-emerald-400" aria-hidden="true" />
          </div>
        </div>
      </button>
    );
  }

  // --------------------------------------------------------------------------
  // 미선택 태그 스타일
  // --------------------------------------------------------------------------
  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-pressed={false}
      aria-label={`${tag} 태그 선택 (${count}개 글)`}
      style={
        isNewlyAdded && animationDelay > 0
          ? { animationDelay: `${animationDelay}ms` }
          : undefined
      }
      className={cn(
        'group inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-xl',
        'bg-gray-800/40 backdrop-blur-sm',
        'border border-gray-700/40',
        'text-gray-400',
        'hover:bg-gray-800/60 hover:border-emerald-500/30 hover:text-emerald-400',
        'hover:shadow-lg hover:shadow-emerald-500/5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        'transition-all duration-300 ease-out',
        'hover:-translate-y-0.5',
        isNewlyAdded && 'animate-fade-in-up'
      )}
    >
      <span className="group-hover:text-emerald-400 transition-colors">
        #{tag}
      </span>
      <span className="text-[10px] font-semibold text-gray-500 group-hover:text-emerald-400/70 tabular-nums transition-colors">
        {count}
      </span>
    </button>
  );
});
