import { createCanvas, CanvasRenderingContext2D, registerFont } from 'canvas';
import { resolve } from 'path';

const fontPath = resolve(process.cwd(), 'fonts/AppleSDGothicNeo.ttc');
registerFont(fontPath, { family: 'Sans' });

interface CrashAlertCause {
  factor: string;
  impact: string;
  detail: string;
}

interface CrashAlertData {
  type: 'crash_alert';
  severity: 'warning' | 'critical';
  title: string;
  market_overview: Record<string, string>;
  causes: CrashAlertCause[];
  outlook: string;
  investor_guidance: string;
}

const MARKET_LABELS: Record<string, string> = {
  kospi_futures: 'KOSPI 선물',
  kosdaq_futures: 'KOSDAQ 선물',
  sp500_close: 'S&P 500',
  nasdaq_close: 'NASDAQ',
  dow_close: 'Dow Jones',
  vix: 'VIX',
  usd_krw: '원/달러',
};

/**
 * Crash Alert 데이터를 트위터 업로드용 이미지로 변환
 */
export async function crashAlertToImage(data: CrashAlertData): Promise<Buffer> {
  const width = 1200;
  const height = 675;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const isCritical = data.severity === 'critical';

  // 배경 그라데이션
  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, isCritical ? '#450A0A' : '#451A03');
  bgGradient.addColorStop(1, '#0F172A');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  let currentY = 30;

  // ============ HEADER ============
  currentY = drawCrashHeader(ctx, width, currentY, data, isCritical);

  // ============ MARKET OVERVIEW ============
  currentY = drawMarketOverview(ctx, width, currentY, data.market_overview);

  // ============ CAUSES ============
  drawCauses(ctx, width, currentY, data.causes);

  return canvas.toBuffer('image/png');
}

function drawCrashHeader(
  ctx: CanvasRenderingContext2D,
  width: number,
  startY: number,
  data: CrashAlertData,
  isCritical: boolean
): number {
  const centerX = width / 2;
  let y = startY;

  // "Stock Matrix" 로고
  ctx.fillStyle = isCritical ? '#FCA5A5' : '#FCD34D';
  ctx.font = 'bold 20px Sans';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('STOCK MATRIX', centerX, y + 10);
  y += 40;

  // Severity 배지
  const badgeText = isCritical ? 'CRITICAL' : 'WARNING';
  const badgeColor = isCritical ? '#DC2626' : '#F59E0B';
  const badgeTextColor = isCritical ? '#FFFFFF' : '#0F172A';
  const badgeW = 140;
  const badgeH = 30;
  ctx.fillStyle = badgeColor;
  roundRect(ctx, centerX - badgeW / 2, y - badgeH / 2, badgeW, badgeH, 6);
  ctx.fill();
  ctx.fillStyle = badgeTextColor;
  ctx.font = 'bold 14px Sans';
  ctx.fillText(badgeText, centerX, y);
  y += 35;

  // 메인 타이틀
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 36px Sans';
  ctx.fillText('긴급 시장 분석', centerX, y);
  y += 35;

  // 서브 타이틀 (폭락 제목)
  ctx.fillStyle = '#94A3B8';
  ctx.font = '20px Sans';
  const titleText = data.title.length > 30 ? data.title.substring(0, 30) + '...' : data.title;
  ctx.fillText(titleText, centerX, y);
  y += 35;

  // 날짜 배지
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  });
  const dateBadgeW = 220;
  const dateBadgeH = 34;
  ctx.fillStyle = isCritical ? '#7F1D1D' : '#78350F';
  ctx.strokeStyle = isCritical ? '#991B1B' : '#92400E';
  ctx.lineWidth = 1;
  roundRect(ctx, centerX - dateBadgeW / 2, y - dateBadgeH / 2, dateBadgeW, dateBadgeH, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '16px Sans';
  ctx.fillText(today, centerX, y);

  return y + 30;
}

function drawMarketOverview(
  ctx: CanvasRenderingContext2D,
  width: number,
  startY: number,
  overview: Record<string, string>
): number {
  const cardX = 40;
  const cardW = width / 2 - 60;
  const cardH = 310;

  // 시장 현황 카드 배경
  ctx.fillStyle = '#1E293B';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, startY, cardW, cardH, 10);
  ctx.fill();
  ctx.stroke();

  // 타이틀
  let y = startY + 30;
  ctx.fillStyle = '#0EA5E9';
  ctx.font = 'bold 15px Sans';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('시장 현황', cardX + 24, y);
  y += 10;

  // 구분선
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 20, y);
  ctx.lineTo(cardX + cardW - 20, y);
  ctx.stroke();
  y += 15;

  // 지표 목록
  const entries = Object.entries(overview);
  entries.forEach(([key, value]) => {
    const label = MARKET_LABELS[key] || key;
    const isNegative = typeof value === 'string' && value.includes('-');

    ctx.fillStyle = '#94A3B8';
    ctx.font = '16px Sans';
    ctx.textAlign = 'left';
    ctx.fillText(label, cardX + 24, y);

    ctx.fillStyle = isNegative ? '#EF4444' : '#E2E8F0';
    ctx.font = 'bold 17px Sans';
    ctx.textAlign = 'right';
    ctx.fillText(String(value), cardX + cardW - 24, y);
    y += 34;
  });

  return startY;
}

function drawCauses(
  ctx: CanvasRenderingContext2D,
  width: number,
  startY: number,
  causes: CrashAlertCause[]
): void {
  const cardX = width / 2 + 20;
  const cardW = width / 2 - 60;
  const cardH = 310;

  // 원인 분석 카드 배경
  ctx.fillStyle = '#1E293B';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, startY, cardW, cardH, 10);
  ctx.fill();
  ctx.stroke();

  // 타이틀
  let y = startY + 30;
  ctx.fillStyle = '#DC2626';
  ctx.font = 'bold 15px Sans';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('원인 분석', cardX + 24, y);
  y += 10;

  // 구분선
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 20, y);
  ctx.lineTo(cardX + cardW - 20, y);
  ctx.stroke();
  y += 20;

  // 원인 목록 (최대 3개)
  const topCauses = causes.slice(0, 3);
  topCauses.forEach((cause) => {
    // Impact 배지 색상
    const impactColors: Record<string, { bg: string; text: string }> = {
      high: { bg: '#DC2626', text: '#FFFFFF' },
      medium: { bg: '#F59E0B', text: '#0F172A' },
      low: { bg: '#0EA5E9', text: '#FFFFFF' },
    };
    const colors = impactColors[cause.impact] || impactColors.medium;

    // 원인명
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 17px Sans';
    ctx.textAlign = 'left';
    ctx.fillText(cause.factor, cardX + 24, y);

    // Impact 배지
    const impactBadgeW = 55;
    const impactBadgeH = 22;
    ctx.fillStyle = colors.bg;
    roundRect(ctx, cardX + cardW - 24 - impactBadgeW, y - impactBadgeH / 2, impactBadgeW, impactBadgeH, 4);
    ctx.fill();
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 11px Sans';
    ctx.textAlign = 'center';
    ctx.fillText(cause.impact.toUpperCase(), cardX + cardW - 24 - impactBadgeW / 2, y);
    y += 25;

    // 상세 설명 (최대 2줄)
    ctx.fillStyle = '#94A3B8';
    ctx.font = '14px Sans';
    ctx.textAlign = 'left';
    const maxCharsPerLine = 28;
    const detail = cause.detail.length > maxCharsPerLine * 2
      ? cause.detail.substring(0, maxCharsPerLine * 2) + '...'
      : cause.detail;
    const line1 = detail.substring(0, maxCharsPerLine);
    const line2 = detail.substring(maxCharsPerLine);
    ctx.fillText(line1, cardX + 24, y);
    if (line2) {
      y += 20;
      ctx.fillText(line2, cardX + 24, y);
    }
    y += 30;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
