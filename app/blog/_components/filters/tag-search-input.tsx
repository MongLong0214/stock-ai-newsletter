/**
 * 태그 검색 입력 컴포넌트
 * - memo로 리렌더 방지
 */
'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Icons } from '../shared/icons';

interface TagSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

export const TagSearchInput = memo(function TagSearchInput({
  value,
  onChange,
  onClear,
}: TagSearchInputProps) {
  return (
    <div className="relative group">
      <div
        className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 rounded-lg blur-sm opacity-0 group-focus-within:opacity-100 transition-opacity duration-300"
        aria-hidden="true"
      />
      <input
        type="search"
        placeholder="태그 검색..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="태그 검색"
        className={cn(
          'relative w-36 pl-3 pr-8 py-2 rounded-lg',
          // iOS Safari 줌 방지: 모바일에서 16px, 데스크톱에서 12px
          'text-base sm:text-xs',
          'bg-gray-900/80 backdrop-blur-sm border border-gray-700/50',
          'text-white placeholder:text-gray-500',
          'transition-all duration-300 ease-out',
          'focus:outline-none focus:border-emerald-500/50 focus:bg-gray-900 focus:w-48',
          'hover:border-gray-600/50'
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="검색어 지우기"
          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-500 hover:text-emerald-400 transition-colors"
        >
          <Icons.Close className="w-3.5 h-3.5" />
        </button>
      ) : (
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
          <Icons.Search className="w-3.5 h-3.5 text-gray-600" aria-hidden="true" />
        </div>
      )}
    </div>
  );
});