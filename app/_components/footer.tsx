function Footer() {
  return (
    <footer className="border-t border-green-500/10 py-12 px-6 lg:px-8 relative" role="contentinfo">
      <div className="max-w-7xl mx-auto text-center">
        <div className="text-sm text-green-300/40 leading-relaxed font-light tracking-wide space-y-2">
          <p className="font-semibold text-green-400/60">⚠️ 투자 유의사항</p>
          <p>본 정보는 AI가 생성한 참고 자료이며, 투자 권유 및 매매 추천이 아닙니다.</p>
          <p>투자의 최종 결정과 그에 따른 손익은 투자자 본인에게 귀속됩니다.</p>
          <p>과거 데이터 및 AI 분석 결과가 미래 수익을 보장하지 않습니다.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;