'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Twitter, Instagram, ChevronDown, ChevronUp } from 'lucide-react';
import { internalLinks } from '@/lib/constants/seo/internal-links';
import { socialConfig } from '@/lib/constants/seo';

function Footer() {
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);

  return (
    <footer className="relative border-t border-slate-700/30" role="contentinfo">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-slate-950/50 to-black pointer-events-none" aria-hidden="true" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-8">
            {/* Brand Section */}
            <div className="lg:col-span-4">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-light text-emerald-400 tracking-tight mb-3">
                    Stock Matrix
                  </h2>
                  <p className="text-slate-400 text-sm leading-relaxed font-light">
                    매일 오전 7시 50분, AI가 분석한 KOSPI·KOSDAQ 3종목의 기술적 분석을 이메일로 받아보세요
                  </p>
                </div>

                {/* Newsletter CTA */}
                <div className="pt-2">
                  <Link
                    href="/subscribe"
                    className="group inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl transition-all duration-300 text-emerald-400 hover:text-emerald-300 text-sm font-medium"
                  >
                    <Mail className="w-4 h-4 group-hover:scale-110 transition-transform" aria-hidden="true" />
                    <span>무료 구독하기</span>
                  </Link>
                </div>

                {/* Social Links */}
                <div className="pt-4">
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-3 font-medium">
                    Connect
                  </p>
                  <div className="flex items-center gap-3">
                    <a
                      href={socialConfig.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-center w-10 h-10 rounded-lg bg-slate-800/50 hover:bg-emerald-600/20 border border-slate-700/50 hover:border-emerald-500/50 transition-all duration-300"
                      aria-label="Twitter"
                    >
                      <Twitter className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                    </a>
                    <a
                      href={socialConfig.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-center w-10 h-10 rounded-lg bg-slate-800/50 hover:bg-emerald-600/20 border border-slate-700/50 hover:border-emerald-500/50 transition-all duration-300"
                      aria-label="Instagram"
                    >
                      <Instagram className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                    </a>
                    <a
                      href={socialConfig.threads}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-center w-10 h-10 rounded-lg bg-slate-800/50 hover:bg-emerald-600/20 border border-slate-700/50 hover:border-emerald-500/50 transition-all duration-300"
                      aria-label="Threads"
                    >
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12.186 3.998a8.38 8.38 0 0 0-2.984.553c-2.344.857-4.092 2.785-4.823 5.316-.177.613.321 1.184.953 1.184a1 1 0 0 0 .959-.718c.563-1.948 1.82-3.441 3.62-4.09a6.386 6.386 0 0 1 2.275-.423c1.708 0 3.146.556 4.163 1.608.996 1.032 1.517 2.487 1.517 4.217v.096c-1.062-.361-2.293-.564-3.633-.564-1.666 0-3.184.33-4.366 1.01-1.266.728-2.042 1.795-2.042 3.15 0 1.303.739 2.356 1.971 2.98 1.164.589 2.68.877 4.28.877 1.664 0 3.146-.33 4.328-1.011 1.266-.729 2.042-1.796 2.042-3.151v-3.77c0-2.198-.679-4.025-1.97-5.296-1.281-1.262-3.069-1.968-5.19-1.968zM12 16.076c-1.275 0-2.399-.215-3.185-.613-.73-.371-.857-.797-.857-1.018 0-.222.127-.647.857-1.018.786-.398 1.91-.613 3.185-.613 1.275 0 2.399.215 3.185.613.73.371.857.797.857 1.018 0 .222-.127.647-.857 1.018-.786.398-1.91.613-3.185.613z"/>
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Sections */}
            <nav className="lg:col-span-8" aria-label="Footer navigation">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
                {/* Services Column */}
                <div>
                  <h3 className="text-slate-300 text-sm font-semibold mb-4 tracking-wide">
                    서비스
                  </h3>
                  <ul className="space-y-3">
                    <li>
                      <Link
                        href="/about"
                        className="text-slate-400 hover:text-emerald-400 text-sm transition-colors duration-200 block"
                        title="Stock Matrix 서비스 소개"
                      >
                        서비스 소개
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/subscribe"
                        className="text-slate-400 hover:text-emerald-400 text-sm transition-colors duration-200 block"
                        title="무료 구독하기"
                      >
                        무료 구독
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/archive"
                        className="text-slate-400 hover:text-emerald-400 text-sm transition-colors duration-200 block"
                        title="과거 뉴스레터 보기"
                      >
                        아카이브
                      </Link>
                    </li>
                  </ul>
                </div>

                {/* Resources Column */}
                <div>
                  <h3 className="text-slate-300 text-sm font-semibold mb-4 tracking-wide">
                    학습 자료
                  </h3>
                  <ul className="space-y-3">
                    <li>
                      <Link
                        href="/technical-indicators"
                        className="text-slate-400 hover:text-emerald-400 text-sm transition-colors duration-200 block"
                        title="기술적 지표 완벽 가이드"
                      >
                        기술적 지표
                      </Link>
                    </li>
                    {internalLinks.quickLinks.slice(0, 3).map((link) => (
                      <li key={link.url}>
                        <Link
                          href={link.url}
                          className="text-slate-400 hover:text-emerald-400 text-sm transition-colors duration-200 block"
                          title={link.title}
                        >
                          {link.text}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Support Column */}
                <div>
                  <h3 className="text-slate-300 text-sm font-semibold mb-4 tracking-wide">
                    지원
                  </h3>
                  <ul className="space-y-3">
                    <li>
                      <Link
                        href="/faq"
                        className="text-slate-400 hover:text-emerald-400 text-sm transition-colors duration-200 block"
                        title="자주 묻는 질문"
                      >
                        FAQ
                      </Link>
                    </li>
                    <li>
                      <a
                        href="mailto:aistockmatrix@gmail.com"
                        className="text-slate-400 hover:text-emerald-400 text-sm transition-colors duration-200 block"
                      >
                        문의하기
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </nav>
          </div>
        </div>

        {/* Legal Disclaimer Section */}
        <div className="border-t border-slate-800/50 py-6">
          <button
            onClick={() => setIsDisclaimerOpen(!isDisclaimerOpen)}
            className="group w-full flex items-center justify-between text-left py-3 px-5 rounded-xl bg-slate-900/30 hover:bg-slate-900/50 border border-slate-800/50 hover:border-slate-700/50 transition-all duration-300"
            aria-expanded={isDisclaimerOpen}
            aria-controls="legal-disclaimer"
          >
            <span className="text-emerald-500/80 text-sm font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              법적 고지 및 투자 유의사항
            </span>
            {isDisclaimerOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-500 group-hover:text-slate-400 transition-colors" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-400 transition-colors" aria-hidden="true" />
            )}
          </button>

          {isDisclaimerOpen && (
            <div
              id="legal-disclaimer"
              className="mt-4 px-5 py-4 bg-slate-900/20 rounded-xl border border-slate-800/30 text-xs text-slate-400 leading-relaxed font-light"
            >
              <p className="text-justify">
                본 서비스는 인공지능(AI)을 활용하여 기술적 지표를 수집·분석한 참고
                자료를 제공하는 정보 제공 서비스로서, 자본시장과 금융투자업에 관한
                법률 제6조에 따른 투자권유, 투자자문, 투자일임 등 어떠한 형태의
                금융투자업 행위도 아니며, 특정 종목의 매수·매도·보유를 권유하거나
                추천하지 않습니다. 제공되는 모든 정보는 교육 및 정보 제공 목적으로만
                사용되어야 하며, 투자 판단 및 최종 의사결정에 대한 책임은 전적으로
                이용자 본인에게 있습니다. 본 서비스는 구체적인 매수가격, 매도가격,
                손절가, 목표가격 등 거래 실행과 관련된 어떠한 정보도 제시하지
                않으며, 모든 매매 시점, 수량, 가격 결정은 투자자 본인의 독립적인
                판단에 따라 이루어져야 합니다. AI 분석 결과 및 과거 데이터는 미래의
                투자 수익률을 보장하지 않으며, 주식 투자에는 원금 손실의 위험이
                항상 존재합니다. 시장 상황, 경제 지표, 기업 실적, 정치적 요인 등
                다양한 변수에 따라 주가는 예측과 다르게 변동할 수 있으며, 투자
                손실에 대한 모든 책임은 투자자 본인에게 귀속됩니다. 본 서비스의
                운영자 및 정보 제공자는 본 정보의 정확성, 완전성, 적시성을 보장하지
                않으며, 본 정보를 이용하여 발생한 투자 손실, 기회 손실, 데이터 오류,
                시스템 장애 등 어떠한 직접적·간접적·부수적·파생적 손해에 대해서도
                법적 책임을 지지 않습니다. 투자자는 본인의 투자 목적, 재무 상태,
                위험 감수 능력을 충분히 고려하여 신중하게 투자 결정을 내려야 하며,
                필요한 경우 금융 전문가와 상담할 것을 권장합니다.
              </p>
            </div>
          )}
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-slate-800/30 py-6">
          <div className="flex items-center justify-center">
            <p className="text-slate-500 text-sm font-light">
              &copy; {new Date().getFullYear()} Stock Matrix. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;