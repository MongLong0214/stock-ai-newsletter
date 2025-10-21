import { createCanvas, CanvasRenderingContext2D, registerFont } from 'canvas';
import { resolve } from 'path';

// 프로젝트 내 한글 폰트 사용 (100% 성공 보장)
const fontPath = resolve(process.cwd(), 'fonts/AppleSDGothicNeo.ttc');
registerFont(fontPath, { family: 'Sans' });

interface StockSignals {
  trend_score: number;
  momentum_score: number;
  volume_score: number;
  volatility_score: number;
  pattern_score: number;
  sentiment_score: number;
  overall_score: number;
}

interface StockAnalysis {
  ticker: string;
  name: string;
  close_price: number;
  rationale: string;
  signals: StockSignals;
}

/**
 * 분석 데이터를 풍성한 이미지로 변환 (이메일 템플릿 스타일)
 */
export async function textToImage(jsonData: string): Promise<Buffer> {
  // JSON 파싱
  let stocks: StockAnalysis[];
  try {
    const parsed = JSON.parse(jsonData);
    stocks = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // JSON이 아닌 경우 기본 텍스트 처리
    return createSimpleTextImage(jsonData);
  }

  // 종합점수 내림차순 정렬 후 상위 3개
  const topStocks = stocks
    .sort((a, b) => b.signals.overall_score - a.signals.overall_score)
    .slice(0, 3);

  // 캔버스 크기 - 고정 높이로 레이아웃 시프트 제거
  const width = 1200;
  const cardHeight = 420; // 각 종목 카드 고정 높이 (450 → 420)
  const margin = 40; // 상하단 여백 통일
  const headerHeight = 200;
  const spacing = 20;
  const height = margin + headerHeight + (cardHeight + spacing) * 3 + spacing + margin;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 배경 그라데이션
  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, '#0F172A');
  bgGradient.addColorStop(1, '#1E293B');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  let currentY = margin; // 상단 여백부터 시작

  // ============ HEADER ============
  currentY = drawHeader(ctx, width, currentY);

  // ============ STOCK CARDS ============
  topStocks.forEach((stock, index) => {
    currentY += spacing;
    currentY = drawStockCard(ctx, stock, index + 1, width, currentY);
  });

  return canvas.toBuffer('image/png');
}

/**
 * 헤더 그리기
 */
function drawHeader(ctx: CanvasRenderingContext2D, width: number, startY: number): number {
  const centerX = width / 2;
  let y = startY + 20;

  // "Stock Matrix" 로고
  ctx.fillStyle = '#10B981';
  ctx.font = 'bold 22px Sans';
  ctx.textAlign = 'center';
  ctx.fillText('STOCK MATRIX', centerX, y);
  y += 50; // 35 → 50

  // 메인 타이틀
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 44px Sans';
  ctx.fillText('오늘의 AI 기술적 분석', centerX, y);
  y += 45; // 35 → 45

  // 서브타이틀
  ctx.fillStyle = '#94A3B8';
  ctx.font = '20px Sans';
  ctx.fillText('30개 기술 지표 분석 - 상위 3개 종목', centerX, y);
  y += 50; // 45 → 50

  // 날짜 배지
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  });

  ctx.fillStyle = '#1E293B';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  const badgeWidth = 250;
  const badgeHeight = 40;
  const badgeX = centerX - badgeWidth / 2;
  const badgeY = y - 28;
  roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '18px Sans';
  ctx.fillText(today, centerX, y);

  return y + 35; // 30 → 35
}

/**
 * 종목 카드 그리기 - 고정 높이 레이아웃 (세로 중앙 정렬)
 */
function drawStockCard(
  ctx: CanvasRenderingContext2D,
  stock: StockAnalysis,
  rank: number,
  width: number,
  startY: number
): number {
  const cardPadding = 40;
  const cardWidth = width - cardPadding * 2;
  const cardX = cardPadding;
  const cardHeight = 420; // 고정 높이 (450 → 420)

  // 카드 배경
  ctx.fillStyle = '#1E293B';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  roundRect(ctx, cardX, startY, cardWidth, cardHeight, 12);
  ctx.fill();
  ctx.stroke();

  // === 섹션 1: 헤더 (순위, 이름, 티커, 종가) ===
  const section1Y = startY + 40;

  // 왼쪽: 순위 + 종목명 (세로 중앙)
  ctx.fillStyle = '#10B981';
  ctx.font = 'bold 26px Sans';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${rank}위`, cardX + 30, section1Y);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 30px Sans';
  ctx.fillText(stock.name, cardX + 85, section1Y);

  // 오른쪽: 티커 + 종가 (세로 중앙)
  ctx.fillStyle = '#64748B';
  ctx.font = '16px Sans';
  ctx.textAlign = 'right';
  ctx.fillText(stock.ticker, cardX + cardWidth - 30, section1Y - 12);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 26px Sans';
  ctx.fillText(`${stock.close_price.toLocaleString()}원`, cardX + cardWidth - 30, section1Y + 15);

  // 구분선
  const divider1Y = startY + 90;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 30, divider1Y);
  ctx.lineTo(cardX + cardWidth - 30, divider1Y);
  ctx.stroke();

  // === 섹션 2: 주요 지표 (고정 3줄, 완벽한 세로 중앙 정렬) ===
  const section2TotalHeight = 30 * 3; // 3줄 총 높이 = 90px (26→30)
  const section2AreaHeight = 98; // 구분선 1 → 구분선 2 영역 (고정)
  const section2CenterOffset = (section2AreaHeight - section2TotalHeight) / 2; // (98 - 90) / 2 = 4px

  // 첫 번째 줄의 중심 위치
  const section2StartY = divider1Y + section2CenterOffset + 15; // 15px = 30px(한 줄 높이) / 2

  let indicatorY = section2StartY;

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '19px Sans'; // 17px → 19px
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const indicators = stock.rationale.split('|').slice(0, 3); // 최대 3개
  indicators.forEach((indicator) => {
    // 불릿 포인트 (텍스트 중앙 기준)
    ctx.fillStyle = '#0EA5E9';
    ctx.beginPath();
    ctx.arc(cardX + 35, indicatorY, 5, 0, Math.PI * 2); // 4px → 5px
    ctx.fill();

    // 텍스트 (세로 중앙 정렬)
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(indicator.trim(), cardX + 55, indicatorY);
    indicatorY += 30; // 26px → 30px
  });

  // 구분선
  const divider2Y = divider1Y + section2AreaHeight;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 30, divider2Y);
  ctx.lineTo(cardX + cardWidth - 30, divider2Y);
  ctx.stroke();

  // === 섹션 3: 기술적 신호 점수 (타이틀) ===
  const section3TitleY = divider2Y + 25;
  ctx.fillStyle = '#0EA5E9';
  ctx.font = 'bold 17px Sans'; // 15px → 17px
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('기술적 신호 점수', cardX + 30, section3TitleY);

  // === 섹션 3: 점수 그리드 (2열 3행) ===
  const scoresStartY = section3TitleY + 28; // 25 → 28
  const scores = [
    { label: '추세', value: stock.signals.trend_score },
    { label: '모멘텀', value: stock.signals.momentum_score },
    { label: '거래량', value: stock.signals.volume_score },
    { label: '변동성', value: stock.signals.volatility_score },
    { label: '패턴', value: stock.signals.pattern_score },
    { label: '심리', value: stock.signals.sentiment_score },
  ];

  const colWidth = (cardWidth - 60) / 2;
  const rowHeight = 36; // 32px → 36px
  const scoreStartX = cardX + 30;

  scores.forEach((score, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = scoreStartX + col * colWidth;
    const scoreY = scoresStartY + row * rowHeight;

    // 라벨 (세로 중앙)
    ctx.fillStyle = '#94A3B8';
    ctx.font = '17px Sans'; // 15px → 17px
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(score.label, x, scoreY);

    // 점수 배지 (세로 중앙)
    const badgeColor = score.value >= 70 ? '#10B981' : score.value >= 40 ? '#F59E0B' : '#EF4444';
    const badgeHeight = 30; // 26px → 30px
    const badgeY = scoreY - badgeHeight / 2;

    ctx.fillStyle = badgeColor;
    roundRect(ctx, x + 85, badgeY, 70, badgeHeight, 6); // 65 → 70
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Sans'; // 16px → 18px
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${score.value}점`, x + 120, scoreY); // 117.5 → 120
  });

  // 구분선
  const divider3Y = scoresStartY + (3 * rowHeight) + 12;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 30, divider3Y);
  ctx.lineTo(cardX + cardWidth - 30, divider3Y);
  ctx.stroke();

  // === 섹션 4: 종합 점수 (완벽한 세로 중앙 정렬) ===
  const section4ContentHeight = 36; // 배지 높이
  const section4AvailableHeight = (startY + cardHeight) - divider3Y; // 구분선 3 ~ 카드 끝
  const section4CenterOffset = (section4AvailableHeight - section4ContentHeight) / 2;
  const section4Y = divider3Y + section4CenterOffset + (section4ContentHeight / 2);

  // 왼쪽 라벨 (세로 중앙)
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px Sans';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('종합 점수', cardX + 30, section4Y);

  // 오른쪽 배지 (세로 중앙)
  const overallColor = stock.signals.overall_score >= 70 ? '#10B981' :
                       stock.signals.overall_score >= 40 ? '#F59E0B' : '#EF4444';
  const overallBadgeHeight = 36;
  const overallBadgeY = section4Y - overallBadgeHeight / 2;

  ctx.fillStyle = overallColor;
  roundRect(ctx, cardX + cardWidth - 140, overallBadgeY, 110, overallBadgeHeight, 8);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 25px Sans';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${stock.signals.overall_score}점`, cardX + cardWidth - 85, section4Y);

  return startY + cardHeight;
}

/**
 * 둥근 사각형 그리기
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * 간단한 텍스트 이미지 (JSON이 아닌 경우)
 */
function createSimpleTextImage(text: string): Buffer {
  const width = 1200;
  const height = 675;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 배경 그라데이션
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0F172A');
  gradient.addColorStop(1, '#1E293B');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 텍스트
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '28px Sans';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = text.split('\n');
  const lineHeight = 40;
  let y = height / 2 - (lines.length * lineHeight) / 2;

  lines.forEach((line) => {
    ctx.fillText(line, width / 2, y);
    y += lineHeight;
  });

  return canvas.toBuffer('image/png');
}