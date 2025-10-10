import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold text-white mb-6">🤖 AI 주식 추천 뉴스레터</h1>
        <p className="text-xl text-white/90 mb-8">
          매일 아침 8시 50분, GPT-4 · Claude · Gemini가<br />분석한 주식 추천을 메일로 받아보세요
        </p>
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-white">
            <div>
              <div className="text-4xl mb-2">🎯</div>
              <h3 className="font-semibold mb-1">3개 AI 분석</h3>
              <p className="text-sm text-white/80">다양한 관점의 추천</p>
            </div>
            <div>
              <div className="text-4xl mb-2">⏰</div>
              <h3 className="font-semibold mb-1">매일 오전 8:50</h3>
              <p className="text-sm text-white/80">장 시작 전 배송</p>
            </div>
            <div>
              <div className="text-4xl mb-2">💸</div>
              <h3 className="font-semibold mb-1">완전 무료</h3>
              <p className="text-sm text-white/80">광고 없음</p>
            </div>
          </div>
        </div>
        <Link
          href="/subscribe"
          className="inline-block bg-white text-purple-600 font-bold text-lg px-8 py-4 rounded-full hover:bg-gray-100 transition shadow-xl hover:shadow-2xl transform hover:scale-105"
        >
          지금 무료 구독하기 →
        </Link>
        <p className="mt-6 text-white/70 text-sm">언제든지 구독 취소 가능 · 개인정보 보호</p>
      </div>
    </div>
  );
}