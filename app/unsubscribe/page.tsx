'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import AnimatedBackground from '@/components/animated-background';

const emailSchema = z.string().pipe(z.email({ message: '잘못된 이메일 형식' }));

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (email && emailSchema.safeParse(email).success) {
      handleUnsubscribe();
    } else if (email) {
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const handleUnsubscribe = async () => {
    if (!email) return;

    setStatus('loading');

    try {
      const { error } = await supabase
        .from('subscribers')
        .update({ is_active: false })
        .eq('email', email);

      if (error) {
        console.error('Unsubscribe error:', error);
        setStatus('error');
        return;
      }

      setStatus('success');
    } catch (error) {
      console.error('Unsubscribe error:', error);
      setStatus('error');
    }
  };

  if (!email || !emailSchema.safeParse(email).success) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
        className="max-w-2xl mx-auto text-center w-full"
        role="alert"
        aria-live="assertive"
      >
        <div className="mb-12 lg:mb-16">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
            className="inline-flex items-center justify-center w-20 lg:w-24 h-20 lg:h-24 rounded-lg glass-morphism border border-red-500/30 mb-10 lg:mb-12"
            aria-hidden="true"
          >
            <XCircle className="w-10 lg:w-12 h-10 lg:h-12 text-red-400" />
          </motion.div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 leading-tight tracking-tight">
            Invalid Request
          </h1>
          <p className="text-xl sm:text-2xl text-slate-300 font-light mb-12 lg:mb-16 tracking-wide">
            유효하지 않은 이메일 주소입니다
          </p>
        </div>
        <Link href="/">
          <Button
            variant="outline"
            className="relative group overflow-hidden bg-black/50 border-emerald-500/30 text-emerald-400 hover:text-black hover:border-emerald-400 rounded-lg px-10 py-6 lg:px-12 lg:py-7 transition-all duration-500 ease-out-expo focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-4 focus:ring-offset-black tracking-wide"
            aria-label="Back to home page"
          >
            <span className="relative z-10 font-medium">Back to Home</span>
            <span className="absolute inset-0 bg-emerald-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out-expo origin-left" aria-hidden="true" />
          </Button>
        </Link>
      </motion.div>
    );
  }

  if (status === 'loading') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
        className="max-w-2xl mx-auto text-center"
      >
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-lg glass-morphism border border-emerald-500/20 mb-12">
          <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
        </div>
        <h1 className="text-6xl md:text-7xl font-extralight mb-8 text-emerald-500/80 tracking-tight">
          Processing
        </h1>
        <p className="text-2xl text-slate-300 font-light tracking-wide">
          구독 취소 요청을 처리하고 있습니다...
        </p>
      </motion.div>
    );
  }

  if (status === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
        className="max-w-2xl mx-auto text-center w-full"
        role="status"
        aria-live="polite"
      >
        <div className="mb-12 lg:mb-16">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
            className="inline-flex items-center justify-center w-20 lg:w-24 h-20 lg:h-24 rounded-lg glass-morphism border border-emerald-500/30 mb-10 lg:mb-12"
            aria-hidden="true"
          >
            <CheckCircle className="w-10 lg:w-12 h-10 lg:h-12 text-emerald-400 animate-[matrix-pulse_2s_ease-in-out_infinite]" />
          </motion.div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 leading-tight tracking-tight">
            Unsubscribed
          </h1>
          <p className="text-xl sm:text-2xl text-slate-300 font-light mb-12 lg:mb-16 tracking-wide">
            구독이 성공적으로 취소되었습니다
          </p>
        </div>

        {/* Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.19, 1, 0.22, 1] }}
          className="glass-morphism rounded-3xl p-8 lg:p-10 border border-emerald-500/20 mb-8 lg:mb-10 text-center relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-emerald-500/5 pointer-events-none" aria-hidden="true" />
          <div className="relative z-10 space-y-6">
            <div>
              <div className="text-sm text-slate-300 mb-3 font-light tracking-wider">Email Address</div>
              <div className="text-lg text-emerald-300/90 break-all font-light tracking-wide">{email}</div>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" aria-hidden="true" />
            <div>
              <div className="text-sm text-slate-300 mb-3 font-light tracking-wider">Status</div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg glass-morphism border border-emerald-500/20">
                <div className="w-2 h-2 rounded-lg bg-emerald-500/60 animate-[matrix-pulse_2s_ease-in-out_infinite]" aria-hidden="true" />
                <span className="text-base text-emerald-300/90 font-light tracking-wide">Inactive</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Notice */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: [0.19, 1, 0.22, 1] }}
          className="flex items-start gap-4 p-6 rounded-2xl glass-morphism border border-emerald-500/20 bg-emerald-500/5 mb-10 lg:mb-12 text-left"
          role="note"
        >
          <AlertCircle className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <p className="text-base text-slate-300 font-light tracking-wide leading-relaxed">
            언제든지 다시 구독하실 수 있습니다
          </p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8, ease: [0.19, 1, 0.22, 1] }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link href="/" className="w-full sm:w-auto">
            <Button
              variant="outline"
              className="w-full sm:w-auto relative group overflow-hidden bg-black/50 border-emerald-500/30 text-emerald-400 hover:text-black hover:border-emerald-400 rounded-lg px-8 py-6 lg:px-10 lg:py-7 transition-all duration-500 ease-out-expo focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-4 focus:ring-offset-black tracking-wide cursor-pointer"
              aria-label="Back to home page"
            >
              <span className="relative z-10 font-medium">홈으로</span>
              <span className="absolute inset-0 bg-emerald-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out-expo origin-left" aria-hidden="true" />
            </Button>
          </Link>
          <Link href="/subscribe" className="w-full sm:w-auto">
            <Button
              className="w-full sm:w-auto group relative overflow-hidden bg-emerald-600 text-black hover:bg-emerald-500 rounded-lg px-8 py-6 lg:px-10 lg:py-7 font-semibold shadow-lg hover:shadow-xl transition-all duration-700 ease-out-expo focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-4 focus:ring-offset-black tracking-wide cursor-pointer"
              aria-label="Subscribe again"
            >
              <span className="relative z-10">다시 구독</span>
              <span className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-700" aria-hidden="true" />
            </Button>
          </Link>
        </motion.div>
      </motion.div>
    );
  }

  if (status === 'error') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
        className="max-w-2xl mx-auto text-center"
      >
        <div className="mb-12 lg:mb-16">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
            className="inline-flex items-center justify-center w-20 lg:w-24 h-20 lg:h-24 rounded-lg glass-morphism border border-red-500/30 mb-10 lg:mb-12"
            aria-hidden="true"
          >
            <XCircle className="w-10 lg:w-12 h-10 lg:h-12 text-red-400" />
          </motion.div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 leading-tight tracking-tight">
            Error
          </h1>
          <p className="text-xl sm:text-2xl text-slate-300 font-light mb-12 lg:mb-16 tracking-wide">
            구독 취소 처리 중 오류가 발생했습니다
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.19, 1, 0.22, 1] }}
          className="flex items-start gap-4 p-6 rounded-2xl glass-morphism border border-red-500/30 bg-red-500/5 mb-10 lg:mb-12 text-left"
        >
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-base text-red-100/80 font-light tracking-wide leading-relaxed">
            시스템 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        </motion.div>

        <Link href="/">
          <Button
            variant="outline"
            className="relative group overflow-hidden bg-black/50 border-emerald-500/30 text-emerald-400 hover:text-black hover:border-emerald-400 rounded-lg px-10 py-6 lg:px-12 lg:py-7 transition-all duration-500 ease-out-expo focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-4 focus:ring-offset-black tracking-wide"
            aria-label="Back to home page"
          >
            <span className="relative z-10 font-medium">Back to Home</span>
            <span className="absolute inset-0 bg-emerald-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out-expo origin-left" aria-hidden="true" />
          </Button>
        </Link>
      </motion.div>
    );
  }

  return null;
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />

      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
      </div>

      {/* Main Content */}
      <main className="pt-20 pb-24 px-6 lg:px-8 flex items-center min-h-screen relative z-10">
        <Suspense
          fallback={
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
              className="max-w-2xl mx-auto text-center w-full"
            >
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-lg glass-morphism border border-emerald-500/20 mb-12">
                <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
              </div>
              <p className="text-xl text-slate-300 font-light tracking-wide">Loading...</p>
            </motion.div>
          }
        >
          <UnsubscribeContent />
        </Suspense>
      </main>
    </div>
  );
}