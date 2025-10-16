'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, CheckCircle, XCircle, Mail, User } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AnimatedBackground from '@/components/animated-background';
import { useCountdownToTomorrow } from '@/hooks/use-countdown-to-tomorrow';
import { isDisposableEmail } from 'disposable-email-domains-js';

const subscribeSchema = z.object({
  email: z.string()
    .min(1, '이메일을 입력해주세요')
    .pipe(z.email({ message: '잘못된 이메일 형식' }))
    .refine((email) => !isDisposableEmail(email), '일회용 이메일은 사용할 수 없습니다'),
  name: z.string().max(100, '이름 길이 제한 초과').optional(),
});

export default function SubscribePage() {
  const { formatted } = useCountdownToTomorrow();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const validated = subscribeSchema.parse({
        email: email.trim(),
        name: name.trim() || undefined,
      });

      // 1. 먼저 기존 구독자 확인
      const { data: existing } = await supabase
        .from('subscribers')
        .select('*')
        .eq('email', validated.email)
        .single();

      if (existing) {
        // 기존 구독자가 있으면 is_active를 true로 업데이트 (재구독)
        const { error: updateError } = await supabase
          .from('subscribers')
          .update({
            is_active: true,
            name: validated.name || existing.name,
          })
          .eq('email', validated.email);

        if (updateError) {
          console.error('Resubscribe error:', updateError);
          setMessage('구독 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
          setStatus('error');
          return;
        }
      } else {
        // 신규 구독자는 INSERT
        const { error: insertError } = await supabase.from('subscribers').insert({
          email: validated.email,
          name: validated.name || null,
        });

        if (insertError) {
          console.error('Subscribe error:', insertError);
          setMessage('구독 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
          setStatus('error');
          return;
        }
      }

      setMessage('구독이 완료되었습니다! 매일 오전 7시 50분에 이메일을 받으실 수 있습니다.');
      setStatus('success');
      setEmail('');
      setName('');
    } catch (error) {
      if (error instanceof z.ZodError) {
        setMessage(error.issues[0].message);
      } else {
        console.error('Subscribe error:', error);
        setMessage('시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
      setStatus('error');
    }
  };

  const features = [
    '3개 AI 독립 분석',
      '총 9개의 종목 추천',
    '매일 오전 7:50 발송',
    '진입가 & 손절가 포함',
    '완전 무료',

  ];

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />

      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-morphism-strong" role="navigation" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-5">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-emerald-400/70 hover:text-emerald-400 transition-all duration-300 ease-out-expo focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-black rounded-lg px-3 py-2 -mx-3 -my-2"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-300 ease-out-expo" aria-hidden="true" />
            <span className="text-sm font-light tracking-wide">Back to Home</span>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 pb-24 px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.19, 1, 0.22, 1] }}
          className="max-w-2xl mx-auto"
        >
          {/* Title Section */}
          <div className="text-center mb-16 lg:mb-20">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
            >
              <h1 className="text-6xl sm:text-7xl md:text-8xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 leading-tight tracking-tight">
                메일 받기
              </h1>


            </motion.div>
          </div>

          {/* Form Container */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.19, 1, 0.22, 1] }}
            className="relative"
          >
            {/* Glass morphism form container */}
            <div className="glass-morphism rounded-3xl p-8 lg:p-12 border border-emerald-500/20 relative overflow-hidden">
              {/* Subtle gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-emerald-500/5 pointer-events-none" aria-hidden="true" />

              <form onSubmit={handleSubmit} className="space-y-8 relative z-10" aria-label="Newsletter subscription form">
                {/* Email Input */}
                <div className="group">
                  <label
                    htmlFor="email"
                    className="block text-base text-slate-300 mb-3 font-light tracking-wide group-focus-within:text-emerald-300/90 transition-colors duration-300"
                  >
                    <span className="flex items-center gap-2">
                      <Mail className="w-4 h-4" aria-hidden="true" />
                      Email Address *
                    </span>
                  </label>
                  <div className="relative">
                    <Input
                      type="email"
                      id="email"
                      name="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      disabled={status === 'loading'}
                      maxLength={255}
                      autoComplete="email"
                      aria-required="true"
                      aria-describedby={message && status === 'error' ? 'form-error' : undefined}
                      className="w-full h-14 lg:h-16 px-6 bg-black/40 border border-emerald-500/20 text-emerald-300 placeholder:text-emerald-400/30 rounded-2xl text-base font-light tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:border-emerald-500/30"
                    />
                    {/* Input glow effect on focus */}
                    <div className="absolute inset-0 rounded-2xl bg-emerald-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none" aria-hidden="true" />
                  </div>
                </div>

                {/* Name Input */}
                <div className="group">
                  <label
                    htmlFor="name"
                    className="block text-base text-slate-300 mb-3 font-light tracking-wide group-focus-within:text-emerald-300/90 transition-colors duration-300"
                  >
                    <span className="flex items-center gap-2">
                      <User className="w-4 h-4" aria-hidden="true" />
                      Name <span className="text-emerald-400/40 text-sm ml-1">(Optional)</span>
                    </span>
                  </label>
                  <div className="relative">
                    <Input
                      type="text"
                      id="name"
                      name="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="홍길동"
                      disabled={status === 'loading'}
                      maxLength={100}
                      autoComplete="name"
                      aria-required="false"
                      className="w-full h-14 lg:h-16 px-6 bg-black/40 border border-emerald-500/20 text-emerald-300 placeholder:text-emerald-400/30 rounded-2xl text-base font-light tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:border-emerald-500/30"
                    />
                    <div className="absolute inset-0 rounded-2xl bg-emerald-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none" aria-hidden="true" />
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={status === 'loading' || status === 'success'}
                  className="w-full h-14 lg:h-16 group relative overflow-hidden bg-emerald-600 text-black hover:bg-emerald-500 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-lg font-semibold rounded-2xl transition-all duration-700 ease-out-expo shadow-lg hover:shadow-xl focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-4 focus:ring-offset-black tracking-wide cursor-pointer"
                  aria-label="Subscribe to newsletter"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {status === 'loading' ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                        처리 중...
                      </>
                    ) : (
                      `${formatted} 후 메일 받기`
                    )}
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-700" aria-hidden="true" />
                </Button>
              </form>

              {/* Status Message */}
              {message && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
                  id={status === 'error' ? 'form-error' : 'form-success'}
                  role="alert"
                  aria-live="polite"
                  className={`mt-8 flex items-start gap-4 p-6 rounded-2xl border ${
                    status === 'success'
                      ? 'glass-morphism border-emerald-500/30 bg-emerald-500/5'
                      : 'glass-morphism border-red-500/30 bg-red-500/5'
                  }`}
                >
                  {status === 'success' ? (
                    <CheckCircle className="w-6 h-6 text-emerald-400 mt-0.5 flex-shrink-0 animate-[matrix-pulse_2s_ease-in-out_infinite]" aria-hidden="true" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  )}
                  <p className={`text-base font-light leading-relaxed tracking-wide ${
                    status === 'success' ? 'text-emerald-100' : 'text-red-100'
                  }`}>
                    {message}
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>



          {/* Disclaimer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.2, ease: [0.19, 1, 0.22, 1] }}
            className="mt-16 lg:mt-20 pt-12 border-t border-slate-700/50"
            role="note"
          >
            <div className="text-sm text-slate-400 font-light leading-relaxed tracking-wide">
              <p className="font-semibold text-emerald-500/60 mb-3 text-center">⚠️ 법적 고지 및 투자 유의사항</p>
              <p className="text-justify">본 서비스는 인공지능(AI)을 활용하여 기술적 지표를 수집·분석한 참고 자료를 제공하는 정보 제공 서비스로서, 자본시장과 금융투자업에 관한 법률 제6조에 따른 투자권유, 투자자문, 투자일임 등 어떠한 형태의 금융투자업 행위도 아니며, 특정 종목의 매수·매도·보유를 권유하거나 추천하지 않습니다. 제공되는 모든 정보는 교육 및 정보 제공 목적으로만 사용되어야 하며, 투자 판단 및 최종 의사결정에 대한 책임은 전적으로 이용자 본인에게 있습니다. 본 서비스는 구체적인 매수가격, 매도가격, 손절가, 목표가격 등 거래 실행과 관련된 어떠한 정보도 제시하지 않으며, 모든 매매 시점, 수량, 가격 결정은 투자자 본인의 독립적인 판단에 따라 이루어져야 합니다. AI 분석 결과 및 과거 데이터는 미래의 투자 수익률을 보장하지 않으며, 주식 투자에는 원금 손실의 위험이 항상 존재합니다. 시장 상황, 경제 지표, 기업 실적, 정치적 요인 등 다양한 변수에 따라 주가는 예측과 다르게 변동할 수 있으며, 투자 손실에 대한 모든 책임은 투자자 본인에게 귀속됩니다. 본 서비스의 운영자 및 정보 제공자는 본 정보의 정확성, 완전성, 적시성을 보장하지 않으며, 본 정보를 이용하여 발생한 투자 손실, 기회 손실, 데이터 오류, 시스템 장애 등 어떠한 직접적·간접적·부수적·파생적 손해에 대해서도 법적 책임을 지지 않습니다. 투자자는 본인의 투자 목적, 재무 상태, 위험 감수 능력을 충분히 고려하여 신중하게 투자 결정을 내려야 하며, 필요한 경우 금융 전문가와 상담할 것을 권장합니다.</p>
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}