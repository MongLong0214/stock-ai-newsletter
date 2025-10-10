'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';

const emailSchema = z.string().email();

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
      <div className="text-center">
        <p className="text-red-600">유효하지 않은 요청입니다.</p>
      </div>
    );
  }

  return (
    <div className="text-center">
      {status === 'loading' && <p className="text-gray-600">처리 중...</p>}
      {status === 'success' && (
        <div className="space-y-4">
          <p className="text-green-600 text-lg font-semibold">✅ 구독이 취소되었습니다.</p>
          <p className="text-gray-600">{email}</p>
          <p className="text-sm text-gray-500">언제든지 다시 구독하실 수 있습니다.</p>
        </div>
      )}
      {status === 'error' && (
        <p className="text-red-600">구독 취소에 실패했습니다. 다시 시도해주세요.</p>
      )}
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">구독 취소</h1>
        <Suspense fallback={<div className="text-center">로딩 중...</div>}>
          <UnsubscribeContent />
        </Suspense>
      </div>
    </div>
  );
}