'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Icons } from '../shared/icons';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  isSearching: boolean;
}

export function SearchBar({ value, onChange, isSearching }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative group">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-emerald-400/5 to-emerald-500/10 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
          {isSearching ? (
            <Icons.Spinner className="w-5 h-5 text-emerald-400" />
          ) : (
            <Icons.Search className={cn(
              'w-5 h-5 transition-colors duration-300',
              value ? 'text-emerald-400' : 'text-gray-300 group-focus-within:text-emerald-400'
            )} />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          placeholder="제목, 설명, 키워드로 검색..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full pl-14 pr-14 py-4 rounded-2xl',
            'bg-gray-900/60 backdrop-blur-sm',
            'border border-gray-800/50',
            'text-white text-sm placeholder:text-gray-500',
            'transition-all duration-300 ease-out',
            'hover:border-gray-700/60 hover:bg-gray-900/80',
            'focus:outline-none focus:border-emerald-500/50 focus:bg-gray-900',
            'focus:shadow-xl focus:shadow-emerald-500/5',
            'shadow-lg shadow-black/5'
          )}
          aria-label="블로그 검색"
        />

        {value && (
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center gap-2 z-10">
            <div className="h-4 w-px bg-gray-700/50" />
            <button
              type="button"
              onClick={() => onChange('')}
              className={cn(
                'p-1.5 rounded-lg',
                'text-gray-500 hover:text-emerald-400',
                'hover:bg-gray-800/50',
                'transition-all duration-200',
                'hover:scale-110'
              )}
              aria-label="검색어 지우기"
            >
              <Icons.Close className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}