'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { faqData } from '@/lib/constants/seo/faq-data';
import FAQAccordionItem from './faq-accordion-item';

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section
      className="relative pt-24 pb-12 px-4 sm:pt-28 sm:pb-16 md:pt-32 md:pb-20"
      aria-labelledby="faq-heading"
    >
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-center mb-12"
        >
          <p className="text-sm text-emerald-500 uppercase tracking-wider mb-4 font-medium">
            FAQ
          </p>
          <h2
            id="faq-heading"
            className="text-3xl md:text-4xl font-extralight text-emerald-500/80 tracking-tight mb-4"
          >
            자주 묻는 질문
          </h2>
          <p className="text-lg text-slate-300 font-light tracking-wide">
            Stock Matrix AI 주식 분석 뉴스레터에 대한 궁금증을 해결해드립니다
          </p>
        </motion.div>

        {/* FAQ Accordion */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="space-y-4"
        >
          {faqData.map((faq, index) => (
            <FAQAccordionItem
              key={index}
              question={faq.question}
              answer={faq.answer}
              index={index}
              isOpen={openIndex === index}
              onToggle={() => handleToggle(index)}
            />
          ))}
        </motion.div>

        {/* CTA Footer */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mt-12 text-center"
        >
          <div className="bg-slate-800/30 border border-emerald-500/20 rounded-3xl p-6 md:p-8">
            <h3 className="text-xl md:text-2xl font-extralight text-emerald-500/80 tracking-tight mb-3">
              아직 궁금한 점이 있으신가요?
            </h3>
            <p className="text-slate-300 font-light tracking-wide mb-4">
              Stock Matrix 팀이 친절하게 답변해드립니다
            </p>
            <a
              href="mailto:aistockmatrix@gmail.com"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-3xl transition-all duration-700 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              aria-label="Stock Matrix 이메일 문의하기"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              이메일로 문의하기
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default FAQSection;