/**
 * 태그 버튼 컴포넌트
 * - memo로 리렌더 방지
 * - data-tag로 Event delegation 지원
 */
'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Icons } from '../shared/icons';

interface TagButtonProps {
  tag: string;
  count: number;
  isSelected: boolean;
  animationDelay?: number;
  isNewlyAdded?: boolean;
}

export const TagButton = memo(function TagButton({
  tag,
  count,
  isSelected,
  animationDelay = 0,
  isNewlyAdded = false,
}: TagButtonProps) {
  return (
    <button
      type="button"
      data-tag={tag}
      aria-pressed={isSelected}
      aria-label={`${tag} 태그 ${isSelected ? '선택 해제' : '선택'} (${count}개 글)`}
      style={isNewlyAdded && animationDelay > 0 ? { animationDelay: `${animationDelay}ms` } : undefined}
      className={cn(
        'group inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-xl',
        'transition-all duration-300 ease-out hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        isSelected
          ? [
              'pl-3 pr-2.5',
              'bg-gradient-to-br from-emerald-500/20 to-emerald-400/10',
              'border border-emerald-500/40 shadow-lg shadow-emerald-500/10',
              'hover:shadow-emerald-500/20 hover:border-emerald-500/60',
            ]
          : [
              'bg-gray-800/40 backdrop-blur-sm border border-gray-700/40 text-gray-400',
              'hover:bg-gray-800/60 hover:border-emerald-500/30 hover:text-emerald-400',
              'hover:shadow-lg hover:shadow-emerald-500/5',
              isNewlyAdded && 'animate-fade-in-up',
            ]
      )}
    >
      <span className={isSelected ? 'text-emerald-400' : 'group-hover:text-emerald-400 transition-colors'}>
        #{tag}
      </span>
      <div className={cn('flex items-center', isSelected && 'gap-1.5')}>
        <span
          className={cn(
            'text-[10px] font-semibold tabular-nums',
            isSelected
              ? 'text-emerald-400/70'
              : 'text-gray-500 group-hover:text-emerald-400/70 transition-colors'
          )}
        >
          {count}
        </span>
        {isSelected && (
          <div className="p-0.5 rounded bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors">
            <Icons.Close className="w-2.5 h-2.5 text-emerald-400" aria-hidden="true" />
          </div>
        )}
      </div>
    </button>
  );
});