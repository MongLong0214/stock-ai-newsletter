'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';

const subscribeSchema = z.object({
  email: z.string().email('올바른 이메일 주소를 입력해주세요.'),
  name: z.string().max(100, '이름은 100자를 초과할 수 없습니다.').optional(),
});

export default function SubscribePage() {
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

      const { error } = await supabase.from('subscribers').insert({
        email: validated.email,
        name: validated.name || null,
      });

      if (error) {
        if (error.code === '23505') {
          setMessage('이미 구독 중인 이메일입니다.');
        } else {
          console.error('Subscribe error:', error);
          setMessage('구독 신청에 실패했습니다. 다시 시도해주세요.');
        }
        setStatus('error');
        return;
      }

      setMessage('구독 신청이 완료되었습니다! 내일 아침 8시 50분에 첫 메일을 받으실 수 있습니다.');
      setStatus('success');
      setEmail('');
      setName('');
    } catch (error) {
      if (error instanceof z.ZodError) {
        setMessage(error.errors[0].message);
      } else {
        console.error('Subscribe error:', error);
        setMessage('오류가 발생했습니다. 다시 시도해주세요.');
      }
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">🤖 AI 주식 추천</h1>
          <p className="text-gray-600">매일 아침 8시 50분, 3개의 AI가 추천하는 주식 정보를 받아보세요</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              이메일 주소 *
            </label>
            <input
              type="email"
              id="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              placeholder="your@email.com"
              disabled={status === 'loading'}
              maxLength={255}
            />
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              이름 (선택)
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              placeholder="홍길동"
              disabled={status === 'loading'}
              maxLength={100}
            />
          </div>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? '처리 중...' : '무료 구독하기'}
          </button>
        </form>

        {message && (
          <div
            className={`mt-4 p-4 rounded-lg ${
              status === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message}
          </div>
        )}

        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-gray-500">💡 GPT-4, Claude, Gemini의 추천을 한 번에!</p>
          <p className="text-xs text-gray-400">완전 무료 · 언제든지 구독 취소 가능</p>
        </div>
      </div>
    </div>
  );
}