/**
 * 태그 검색 입력 컴포넌트
 * - 글로우 효과가 있는 검색 입력
 * - 검색어 지우기 버튼 포함
 */
'use client';

import { cn } from '@/lib/utils';
import { Icons } from '../shared/icons';

// ============================================================================
// 타입 정의
// ============================================================================

interface TagSearchInputProps {
  /** 검색어 */
  value: string;
  /** 검색어 변경 핸들러 */
  onChange: (value: string) => void;
  /** 검색어 초기화 핸들러 */
  onClear: () => void;
}

// ============================================================================
// 컴포넌트
// ============================================================================

export function TagSearchInput({ value, onChange, onClear }: TagSearchInputProps) {
  return (
    <div className="relative group">
      {/* 포커스 글로우 효과 */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 rounded-lg blur-sm opacity-0 group-focus-within:opacity-100 transition-opacity duration-300"
        aria-hidden="true"
      />

      {/* 검색 입력 */}
      <input
        type="search"
        placeholder="태그 검색..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="태그 검색"
        className={cn(
          'relative w-36 pl-3 pr-8 py-2 text-xs rounded-lg',
          'bg-gray-900/80 backdrop-blur-sm border border-gray-700/50',
          'text-white placeholder:text-gray-500',
          'transition-all duration-300 ease-out',
          'focus:outline-none focus:border-emerald-500/50 focus:bg-gray-900 focus:w-48',
          'hover:border-gray-600/50'
        )}
      />

      {/* 검색어 지우기 버튼 or 검색 아이콘 */}
      {value ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="검색어 지우기"
          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-500 hover:text-emerald-400 transition-colors duration-200"
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
}