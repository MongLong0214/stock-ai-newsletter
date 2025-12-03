'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, List } from 'lucide-react';
import type { TOCItem } from '../../_utils/toc-extractor';

interface TableOfContentsProps {
  items: TOCItem[];
  variant?: 'mobile' | 'desktop';
}

/**
 * 목차(Table of Contents) 컴포넌트
 *
 * 블로그 글의 H2, H3 제목을 추출하여 목차를 생성하고,
 * 현재 읽고 있는 섹션을 하이라이트합니다.
 *
 * @param items - 목차 아이템 배열 (id, text, level)
 * @param variant - 'mobile': 드롭다운 형태 | 'desktop': Sticky 사이드바 형태
 */
export function TableOfContents({ items, variant = 'mobile' }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);

  // IntersectionObserver로 현재 보고 있는 섹션 추적
  useEffect(() => {
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // 화면에 들어온 제목 요소를 활성화
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-80px 0px -80% 0px', // 헤더 영역 제외, 하단 80% 제외
        threshold: 0,
      }
    );

    // 모든 제목 요소 관찰 시작
    items.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [items]);

  // 목차 아이템이 없으면 렌더링하지 않음
  if (items.length === 0) return null;

  /**
   * 목차 클릭 핸들러
   *
   * 문제: 모바일 드롭다운이 열린 상태에서 스크롤하면,
   *       드롭다운이 닫히면서 레이아웃 높이가 변경되어 스크롤 위치 오차 발생
   *
   * 해결: setIsOpen(false) → requestAnimationFrame → scrollIntoView 순서
   *       1. 드롭다운 닫기
   *       2. 레이아웃 재계산 대기
   *       3. 정확한 위치로 스크롤
   */
  const handleClick = (id: string) => {
    // 1. 모바일 드롭다운 닫기 (desktop에서는 isOpen이 항상 false이므로 무해)
    setIsOpen(false);

    // 2. 브라우저가 레이아웃을 재계산한 후 스크롤 실행
    requestAnimationFrame(() => {
      const element = document.getElementById(id);
      if (!element) return;

      // 3. CSS scroll-margin-top (6rem)을 고려하여 부드럽게 스크롤
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // 모바일 드롭다운
  if (variant === 'mobile') {
    return (
      <div className="mb-8">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <List className="w-4 h-4" />
            목차
          </span>
          <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
        </button>
        {isOpen && (
          <nav className="mt-2 p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleClick(item.id)}
                    className={cn(
                      'block w-full text-left text-sm transition-colors',
                      item.level === 3 && 'pl-4',
                      activeId === item.id
                        ? 'text-emerald-400 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    )}
                  >
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    );
  }

  // 데스크톱 사이드바
  return (
    <div className="sticky top-24">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
        목차
      </p>
      <nav>
        <ul className="space-y-2 border-l border-slate-800">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => handleClick(item.id)}
                className={cn(
                  'block w-full text-left text-sm transition-all border-l-2 -ml-[2px]',
                  item.level === 3 ? 'pl-6' : 'pl-4',
                  activeId === item.id
                    ? 'text-emerald-400 border-emerald-400 font-medium'
                    : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'
                )}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}