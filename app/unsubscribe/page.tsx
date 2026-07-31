'use client';

import { useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, AlertCircle, Mail } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AnimatedBackground from '@/components/animated-background';

/**
 * Recovery form for subscribers whose link is missing, legacy (`?email=`) or
 * expired. Requesting a link never opts anyone out on its own — the mailed link
 * still requires explicit confirmation.
 */
function RequestLinkForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleRequest = async () => {
    setState('sending');
    try {
      const res = await fetch('/api/unsubscribe/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  };

  if (state === 'sent') {
    return (
      <div
        className="flex items-start gap-4 p-6 rounded-2xl glass-morphism border border-emerald-500/20 bg-emerald-500/5 text-left"
        role="status"
        aria-live="polite"
      >
        <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <p className="text-base text-slate-300 font-light tracking-wide leading-relaxed">
          해당 주소가 구독 중이라면 구독 취소 링크를 발송했습니다. 이메일을 확인해주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto text-left">
      <label htmlFor="unsubscribe-email" className="block text-sm text-slate-400 mb-3 tracking-wide">
        구독하신 이메일 주소를 입력하시면 구독 취소 링크를 보내드립니다
      </label>
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          id="unsubscribe-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="bg-black/50 border-emerald-500/30 text-slate-200 placeholder:text-slate-600 rounded-lg px-4 py-6"
        />
        <Button
          onClick={handleRequest}
          disabled={state === 'sending' || email.trim().length === 0}
          className="bg-emerald-600 text-black hover:bg-emerald-500 rounded-lg px-6 py-6 font-semibold disabled:opacity-50 cursor-pointer"
        >
          {state === 'sending' ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <span className="whitespace-nowrap">링크 받기</span>
          )}
        </Button>
      </div>
      {state === 'error' && (
        <p className="mt-3 text-sm text-red-300/90" role="alert">
          요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  // Token-only for the mutation itself. A legacy `?email=` link only prefills the
  // recovery form — it never unsubscribes directly.
  const token = searchParams.get('token');
  const legacyEmail = searchParams.get('email') ?? '';
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'expired'>('idle');

  const hasValidParam = !!token;

  const handleUnsubscribe = async () => {
    setStatus('loading');

    try {
      const payload = { token };
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 410) {
        setStatus('expired');
        return;
      }

      if (!res.ok) {
        setStatus('error');
        return;
      }

      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  if (!hasValidParam) {
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
            className="inline-flex items-center justify-center w-20 lg:w-24 h-20 lg:h-24 rounded-lg glass-morphism border border-emerald-500/30 mb-10 lg:mb-12"
            aria-hidden="true"
          >
            <Mail className="w-10 lg:w-12 h-10 lg:h-12 text-emerald-400" />
          </motion.div>
          <p className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 leading-tight tracking-tight" role="heading" aria-level={2}>
            Unsubscribe
          </p>
          <p className="text-xl sm:text-2xl text-slate-300 font-light mb-12 lg:mb-16 tracking-wide">
            구독 취소 링크를 받아 진행해주세요
          </p>
        </div>

        <RequestLinkForm initialEmail={legacyEmail} />

        <div className="mt-10">
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
        </div>
      </motion.div>
    );
  }

  if (status === 'idle') {
    // Explicit confirmation — no page-load mutation
    return (
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
        className="max-w-2xl mx-auto text-center w-full"
      >
        <div className="mb-12 lg:mb-16">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
            className="inline-flex items-center justify-center w-20 lg:w-24 h-20 lg:h-24 rounded-lg glass-morphism border border-emerald-500/30 mb-10 lg:mb-12"
            aria-hidden="true"
          >
            <AlertCircle className="w-10 lg:w-12 h-10 lg:h-12 text-emerald-400" />
          </motion.div>
          <p className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 leading-tight tracking-tight" role="heading" aria-level={2}>
            Unsubscribe
          </p>
          <p className="text-xl sm:text-2xl text-slate-300 font-light mb-12 lg:mb-16 tracking-wide">
            뉴스레터 구독을 취소하시겠습니까?
          </p>
        </div>

        <Button
          onClick={handleUnsubscribe}
          className="group relative overflow-hidden bg-red-600 text-white hover:bg-red-500 rounded-lg px-10 py-6 lg:px-12 lg:py-7 font-semibold shadow-lg hover:shadow-xl transition-all duration-700 ease-out-expo focus:ring-2 focus:ring-red-500/50 focus:ring-offset-4 focus:ring-offset-black tracking-wide cursor-pointer"
          aria-label="구독 취소 확인"
        >
          <span className="relative z-10">구독 취소 확인</span>
        </Button>

        <div className="mt-6">
          <Link href="/">
            <Button
              variant="outline"
              className="relative group overflow-hidden bg-black/50 border-emerald-500/30 text-emerald-400 hover:text-black hover:border-emerald-400 rounded-lg px-8 py-4 transition-all duration-500 ease-out-expo tracking-wide"
              aria-label="취소하고 홈으로"
            >
              <span className="relative z-10 font-medium">취소</span>
              <span className="absolute inset-0 bg-emerald-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out-expo origin-left" aria-hidden="true" />
            </Button>
          </Link>
        </div>
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
        <p className="text-6xl md:text-7xl font-extralight mb-8 text-emerald-500/80 tracking-tight" role="heading" aria-level={2}>
          Processing
        </p>
        <p className="text-2xl text-slate-300 font-light tracking-wide">
          구독 취소 요청을 처리하고 있습니다...
        </p>
      </motion.div>
    );
  }

  if (status === 'expired') {
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
            className="inline-flex items-center justify-center w-20 lg:w-24 h-20 lg:h-24 rounded-lg glass-morphism border border-emerald-500/30 mb-10 lg:mb-12"
            aria-hidden="true"
          >
            <AlertCircle className="w-10 lg:w-12 h-10 lg:h-12 text-yellow-400" />
          </motion.div>
          <p className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 leading-tight tracking-tight" role="heading" aria-level={2}>
            Link Expired
          </p>
          <p className="text-xl sm:text-2xl text-slate-300 font-light mb-12 lg:mb-16 tracking-wide">
            구독 취소 링크가 만료되었습니다. 새 링크를 받아 진행해주세요.
          </p>
        </div>

        <RequestLinkForm initialEmail={legacyEmail} />

        <div className="mt-10">
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
        </div>
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
          <p className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 leading-tight tracking-tight" role="heading" aria-level={2}>
            Unsubscribed
          </p>
          <p className="text-xl sm:text-2xl text-slate-300 font-light mb-12 lg:mb-16 tracking-wide">
            구독이 성공적으로 취소되었습니다
          </p>
        </div>

        {/* Notice */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.19, 1, 0.22, 1] }}
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
          transition={{ duration: 0.8, delay: 0.6, ease: [0.19, 1, 0.22, 1] }}
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

  // status === 'error'
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
        <p className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 leading-tight tracking-tight" role="heading" aria-level={2}>
          Error
        </p>
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
        <h1 className="sr-only">구독 취소</h1>
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
