import type { ReactNode } from 'react';

/**
 * 법적 고지 페이지(개인정보처리방침·이용약관) 공통 셸.
 * 신규 디자인 없이 기존 페이지의 배경·타이포 클래스만 그대로 사용한다.
 */

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-400 font-light">
        {children}
      </div>
    </section>
  );
}

export default function LegalPage({
  title,
  effectiveDate,
  children,
}: {
  children: ReactNode;
  effectiveDate: string;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-5 py-20">
        <h1 className="text-2xl font-medium">{title}</h1>
        <p className="mt-2 text-sm text-slate-500 font-light">시행일: {effectiveDate}</p>
        {children}
      </div>
    </main>
  );
}
