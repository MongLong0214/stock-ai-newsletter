'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, List } from 'lucide-react';
import type { TOCItem } from '../../_utils/toc-extractor';

interface TableOfContentsProps {
  items: TOCItem[];
}

/**
 * 목차 컴포넌트
 * - 데스크톱: Sticky 사이드바
 * - 모바일: 접을 수 있는 드롭다운
 */
export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-80px 0px -80% 0px', threshold: 0 }
    );

    items.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const handleClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const y = element.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: 'smooth' });
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Mobile: Dropdown */}
      <div className="lg:hidden mb-8">
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

      {/* Desktop: Sticky Sidebar */}
      <aside className="hidden lg:block">
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
      </aside>
    </>
  );
}
