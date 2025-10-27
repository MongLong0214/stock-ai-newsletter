'use client';

interface FAQAccordionItemProps {
  question: string;
  answer: string;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * FAQ Accordion Item - Enterprise-grade minimal client component
 *
 * Features:
 * - Controlled accordion state from parent (only one open at a time)
 * - Smooth CSS transitions (no Framer Motion overhead)
 * - Professional focus states matching homepage design
 * - Keyboard accessible
 * - Minimal JavaScript
 */
function FAQAccordionItem({
  question,
  answer,
  index,
  isOpen,
  onToggle,
}: FAQAccordionItemProps) {

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <article
      itemScope
      itemProp="mainEntity"
      itemType="https://schema.org/Question"
      className="group bg-slate-800/50 border border-emerald-500/20 rounded-3xl overflow-hidden transition-all duration-700 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10"
    >
      {/* Question Button */}
      <button
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-controls={`faq-answer-${index}`}
        className="relative w-full px-6 py-5 flex items-center justify-between text-left transition-colors duration-700 hover:bg-slate-800/70 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
      >
        <h3
          itemProp="name"
          className="text-base md:text-lg font-light text-white pr-4 leading-relaxed tracking-wide"
        >
          {question}
        </h3>
        <div
          className={`flex-shrink-0 transition-transform duration-500 ease-out-expo ${
            isOpen ? 'rotate-180' : 'rotate-0'
          }`}
          aria-hidden="true"
        >
          <svg
            className="w-5 h-5 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Answer Panel with smooth height transition */}
      <div
        id={`faq-answer-${index}`}
        className={`grid transition-all duration-500 ease-out-expo ${
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        itemScope
        itemProp="acceptedAnswer"
        itemType="https://schema.org/Answer"
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-5 pt-2">
            <p
              itemProp="text"
              className="text-slate-300 font-light leading-relaxed tracking-wide text-sm md:text-base"
            >
              {answer}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default FAQAccordionItem;