/**
 * Crash Alert 카드 컴포넌트
 *
 * 폭락장 감지 분석 기록을 표시하는 카드
 */

'use client';

import { AlertTriangle, TrendingDown, Shield, Eye } from 'lucide-react';
import type { CrashAlertData } from '../../_types/archive.types';

const MARKET_LABELS: Record<string, string> = {
  kospi_futures: 'KOSPI 선물',
  kosdaq_futures: 'KOSDAQ 선물',
  sp500_close: 'S&P 500',
  nasdaq_close: 'NASDAQ',
  dow_close: 'Dow Jones',
  vix: 'VIX 공포지수',
  usd_krw: '원/달러 환율',
};

const IMPACT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-red-500/20', text: 'text-red-400', label: '높음' },
  medium: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: '중간' },
  low: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '낮음' },
};

interface CrashAlertCardProps {
  crashAlert: CrashAlertData;
}

export const CrashAlertCard = ({ crashAlert }: CrashAlertCardProps) => {
  const isCritical = crashAlert.severity === 'critical';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className={`rounded-2xl border p-6 backdrop-blur-xl shadow-2xl ${
          isCritical
            ? 'border-red-500/30 bg-red-950/40 shadow-red-500/10'
            : 'border-amber-500/30 bg-amber-950/40 shadow-amber-500/10'
        }`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              isCritical ? 'bg-red-500/20' : 'bg-amber-500/20'
            }`}
          >
            <AlertTriangle
              className={`h-6 w-6 ${isCritical ? 'text-red-400' : 'text-amber-400'}`}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  isCritical
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {isCritical ? 'CRITICAL' : 'WARNING'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white sm:text-2xl">{crashAlert.title}</h2>
          </div>
        </div>
      </div>

      {/* Market Overview */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-xl p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-red-400" aria-hidden="true" />
          <h3 className="text-lg font-bold text-white">시장 개요</h3>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-700/50">
          <table className="w-full">
            <tbody>
              {Object.entries(crashAlert.market_overview).map(([key, value]) => {
                const label = MARKET_LABELS[key] || key;
                const isNegative = typeof value === 'string' && value.includes('-');
                return (
                  <tr key={key} className="border-b border-slate-700/30 last:border-b-0">
                    <td className="px-4 py-3 text-sm font-medium text-slate-400">{label}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono text-sm font-semibold ${
                        isNegative ? 'text-red-400' : 'text-slate-200'
                      }`}
                    >
                      {value}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Causes */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-xl p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden="true" />
          <h3 className="text-lg font-bold text-white">원인 분석</h3>
        </div>
        <div className="space-y-3">
          {crashAlert.causes.map((cause) => {
            const impact = IMPACT_STYLES[cause.impact] || IMPACT_STYLES.medium;
            return (
              <div
                key={cause.factor}
                className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-white">{cause.factor}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${impact.bg} ${impact.text}`}
                  >
                    영향: {impact.label}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-300">{cause.detail}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Historical Context */}
      {crashAlert.historical_context && (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-xl p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5 text-purple-400" aria-hidden="true" />
            <h3 className="text-lg font-bold text-white">역사적 맥락</h3>
          </div>
          <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">
            {crashAlert.historical_context}
          </p>
        </div>
      )}

      {/* Outlook & Investor Guidance */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-xl p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5 text-cyan-400" aria-hidden="true" />
            <h3 className="text-lg font-bold text-white">전망</h3>
          </div>
          <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">
            {crashAlert.outlook}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-xl p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            <h3 className="text-lg font-bold text-white">투자자 가이드</h3>
          </div>
          <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">
            {crashAlert.investor_guidance}
          </p>
        </div>
      </div>
    </div>
  );
};
