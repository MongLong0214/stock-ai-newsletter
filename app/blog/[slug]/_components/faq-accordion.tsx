'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import type { FAQItem } from '../../_types/blog';

interface FAQAccordionProps {
  items: FAQItem[];
}

/**
 * FAQ 아코디언 컴포넌트
 * 애니메이션 효과와 함께 질문/답변 표시
 */
export function FAQAccordion({ items }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!items || items.length === 0) return null;

  return (
    <section className="mt-16 pt-10 border-t border-slate-800">
      <h2 className="text-2xl font-bold mb-8 text-white">자주 묻는 질문</h2>
      <div className="space-y-3">
        {items.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={index}
              className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/30 hover:bg-slate-900/50 transition-colors"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex items-center justify-between w-full px-5 py-4 text-left"
                aria-expanded={isOpen}
              >
                <span className="font-medium text-white pr-4">{item.question}</span>
                <ChevronDown
                  className={cn(
                    'w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200',
                    isOpen && 'rotate-180'
                  )}
                />
              </button>
              <div
                className={cn(
                  'grid transition-[grid-template-rows] duration-200 ease-out',
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                )}
              >
                <div className="overflow-hidden">
                  <div className="px-5 pb-4 text-slate-300 leading-relaxed">
                    {item.answer}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}