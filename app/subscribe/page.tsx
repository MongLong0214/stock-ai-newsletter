'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Mail,
  User,
  Shield,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';
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

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden mt-20">
      <AnimatedBackground />

      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
      </div>

      {/* Main Content */}
      <main className="pt-20 pb-24 px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.19, 1, 0.22, 1] }}
          className="max-w-2xl mx-auto"
        >
          {/* Title Section */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
            >
              <h1 className="text-6xl sm:text-7xl md:text-8xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 leading-tight tracking-tight">
                무료 구독하기
              </h1>

              {/* Subheading with value proposition */}
              <h2 className="text-xl sm:text-2xl text-slate-300 mb-8 font-light">
                매일 아침 7:50, AI가 분석한 KOSPI·KOSDAQ 3종목 정보를 이메일로
                받아보세요
              </h2>

              {/* Trust signals */}
              <div className="flex flex-wrap justify-center gap-6 mb-8">
                <div className="flex items-center gap-2 text-emerald-400/80">
                  <Shield className="w-5 h-5" aria-hidden="true" />
                  <span className="text-sm">100% 무료</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400/80">
                  <Clock className="w-5 h-5" aria-hidden="true" />
                  <span className="text-sm">매일 7:50 발송</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400/80">
                  <TrendingUp className="w-5 h-5" aria-hidden="true" />
                  <span className="text-sm">30개 지표 AI 분석</span>
                </div>
              </div>
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
                <motion.button
                  type="submit"
                  disabled={status === 'loading' || status === 'success'}
                  className="w-full py-3.5 px-4 sm:px-8 relative overflow-hidden bg-emerald-600 text-slate-50 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-sm sm:text-base font-medium rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 tracking-wide cursor-pointer border-0 whitespace-nowrap"
                  aria-label="Subscribe to newsletter"
                  initial="rest"
                  whileHover="hover"
                  whileTap="tap"
                  variants={{
                    rest: {
                      scale: 1,
                      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
                    },
                    hover: {
                      scale: 1.02,
                      boxShadow: '0 15px 40px rgba(16, 185, 129, 0.25), 0 0 20px rgba(16, 185, 129, 0.15)',
                      transition: {
                        duration: 0.3,
                        ease: [0.19, 1, 0.22, 1],
                      },
                    },
                    tap: {
                      scale: 0.98,
                      boxShadow: '0 5px 15px rgba(0, 0, 0, 0.2)',
                      transition: {
                        duration: 0.1,
                      },
                    },
                  }}
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

                  {/* Continuous Flowing Gradient - Always Active */}
                  <motion.span
                    className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600 rounded-xl"
                    animate={{
                      backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                      opacity: [0.5, 0.7, 0.5],
                    }}
                    transition={{
                      duration: 3,
                      ease: 'easeInOut',
                      repeat: Infinity,
                    }}
                    style={{
                      backgroundSize: '200% 100%',
                    }}
                    aria-hidden="true"
                  />

                  {/* Subtle Pulse Glow - Always Active */}
                  <motion.span
                    className="absolute inset-0 rounded-xl"
                    animate={{
                      boxShadow: [
                        '0 0 20px rgba(16, 185, 129, 0.3)',
                        '0 0 30px rgba(16, 185, 129, 0.5)',
                        '0 0 20px rgba(16, 185, 129, 0.3)',
                      ],
                    }}
                    transition={{
                      duration: 2,
                      ease: 'easeInOut',
                      repeat: Infinity,
                    }}
                    aria-hidden="true"
                  />

                  {/* Hover Gradient Overlay */}
                  <motion.span
                    className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 rounded-xl"
                    variants={{
                      rest: { opacity: 0 },
                      hover: {
                        opacity: 0.4,
                        transition: {
                          duration: 0.3,
                          ease: 'easeOut',
                        },
                      },
                    }}
                    aria-hidden="true"
                  />

                  {/* Glow Effect Layer */}
                  <motion.span
                    className="absolute inset-0 rounded-xl"
                    variants={{
                      rest: {
                        boxShadow: '0 0 0px rgba(16, 185, 129, 0)',
                      },
                      hover: {
                        boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.2)',
                        transition: {
                          duration: 0.3,
                        },
                      },
                    }}
                    aria-hidden="true"
                  />
                </motion.button>
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
        </motion.div>
      </main>
    </div>
  );
}