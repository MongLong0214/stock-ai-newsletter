import sgMail from '@sendgrid/mail';

// ============================================================================
// Types
// ============================================================================

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface NasdaqNewsletterData {
  geminiAnalysis: string;
  date: string;
}

type Signal = 'MEAN_REVERSION' | 'TREND_PULLBACK';
type Strength = 'STRONG' | 'MODERATE' | 'WEAK';
type Regime = 'A' | 'B';

type PriceBasis = 'CLOSE' | 'LAST_TRADE' | 'EXTENDED';

interface NasdaqPick {
  rank: number;
  ticker: string;
  price: number;
  signal: Signal;
  strength: Strength;
  regime: Regime;
  confidence: number;
  score: number;
  indicators: {
    willr: number;
    rsi: number;
    adx: number;
    atr: number;
    ema20: number;
  };
  prev: {
    willr: number;
    rsi: number;
  };
  trigger: string;
  entryWindow: string;
  priceEvidence?: {
    priceBasis: PriceBasis;
    ohlcvSourceUrl: string;
    ohlcvRowRaw: string;
  };
  warnings: string[];
}

interface NasdaqCompactResponse {
  timestamp: string;
  version: string;
  sessionDate: string;
  dataQuality: {
    source: string;
    fresh: boolean;
    verified: boolean;
    fetchMetrics?: {
      ohlcvFetchSuccess: number;
      ohlcvFetchFailed: number;
      totalFetchTimeMs: number;
    };
  };
  picks: NasdaqPick[];
  summary: {
    totalPicks: number;
    avgConfidence: number | null;
    regimeA: number;
    regimeB: number;
  };
  auditTrail?: {
    stage0Count: number;
    stage1Count: number;
    stage2Count: number;
    stage3Count: number;
    stage4TriggeredCount: number;
    stage4EntryWindowPassCount: number;
    stage4ConfidentCount: number;
  };
  noPicksReason?: string;
}

// ============================================================================
// Configuration
// ============================================================================

interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  appUrl: string;
}

let cachedConfig: SendGridConfig | null = null;

function getConfig(): SendGridConfig {
  if (cachedConfig) return cachedConfig;

  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!apiKey || !fromEmail || !fromName || !appUrl) {
    const missing = [
      !apiKey && 'SENDGRID_API_KEY',
      !fromEmail && 'SENDGRID_FROM_EMAIL',
      !fromName && 'SENDGRID_FROM_NAME',
      !appUrl && 'NEXT_PUBLIC_APP_URL',
    ].filter(Boolean);
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  sgMail.setApiKey(apiKey);
  cachedConfig = { apiKey, fromEmail, fromName, appUrl };
  return cachedConfig;
}

// ============================================================================
// Style Helpers
// ============================================================================

const SIGNAL_LABELS: Record<Signal, string> = {
  MEAN_REVERSION: '평균회귀',
  TREND_PULLBACK: '추세눌림',
};

const REGIME_LABELS: Record<Regime, string> = {
  A: '횡보장 (ADX<25)',
  B: '추세장 (ADX≥25)',
};

const STRENGTH_STYLES: Record<Strength, { bg: string; text: string; label: string }> = {
  STRONG: { bg: '#DCFCE7', text: '#15803D', label: '강함' },
  MODERATE: { bg: '#FEF3C7', text: '#CA8A04', label: '보통' },
  WEAK: { bg: '#FEE2E2', text: '#DC2626', label: '약함' },
};

const WARNING_LABELS: Record<string, string> = {
  HIGH_VOLATILITY: '고변동성',
  TIGHT_EMA_MARGIN: 'EMA 근접',
  WEAK_TREND: '약한 추세',
  EXTREME_RSI: '극단 RSI',
};

function getConfidenceStyle(confidence: number): { bg: string; text: string; bar: string } {
  if (confidence >= 80) return { bg: '#DCFCE7', text: '#15803D', bar: '#10B981' };
  if (confidence >= 70) return { bg: '#DBEAFE', text: '#1D4ED8', bar: '#3B82F6' };
  return { bg: '#FEF3C7', text: '#CA8A04', bar: '#F59E0B' };
}

// ============================================================================
// Public API
// ============================================================================

export async function sendNasdaqNewsletter(
  recipients: EmailRecipient[],
  data: NasdaqNewsletterData
): Promise<void> {
  const config = getConfig();
  const subject = `[NASDAQ] ${data.date} AI 기술적 분석`;

  await Promise.all(
    recipients.map((recipient) =>
      sgMail.send({
        to: recipient.email,
        from: { email: config.fromEmail, name: config.fromName },
        subject,
        html: generateNasdaqNewsletterHTML(data, recipient.email, config.appUrl),
      })
    )
  );

  console.log(`NASDAQ email sent: ${recipients.length} recipients`);
}

// ============================================================================
// HTML Generation
// ============================================================================

function generateNasdaqNewsletterHTML(
  data: NasdaqNewsletterData,
  email: string,
  appUrl: string
): string {
  const parsedContent = parseNasdaqAnalysis(data.geminiAnalysis);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NASDAQ 트레이딩 시그널</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Noto Sans KR', 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; background-color: #0F172A;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0F172A;">
    <tr>
      <td style="padding: 32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto;">
          <!-- Header -->
          <tr>
            <td style="padding: 24px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #10B981; letter-spacing: 0.1em; text-transform: uppercase;">NASDAQ 추천 종목</p>
              <h1 style="margin: 0 0 12px 0; font-size: 28px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.02em;">오늘의 트레이딩 시그널</h1>
              <p style="margin: 0 0 16px 0; font-size: 13px; color: #94A3B8;">Williams %R + ADX 기반 기술적 분석</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 6px 14px; background-color: #1E293B; border: 1px solid #334155; border-radius: 6px;">
                    <span style="font-size: 12px; font-weight: 500; color: #E2E8F0;">${data.date}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td>${parsedContent}</td>
          </tr>
          <!-- Disclaimer -->
          <tr>
            <td style="padding: 24px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #1E293B; border: 1px solid #334155; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 600; color: #F59E0B;">면책 조항</p>
                    <p style="margin: 0; font-size: 10px; color: #64748B; line-height: 1.6;">본 정보는 투자 조언이 아닙니다. 모든 정보는 교육 목적으로만 제공됩니다. 과거 실적이 미래 수익을 보장하지 않습니다. 주식 거래에는 상당한 손실 위험이 따릅니다. 투자 결정 전 반드시 직접 조사하시고 필요시 금융 전문가와 상담하시기 바랍니다. 본 서비스는 발생한 손실에 대해 책임지지 않습니다.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 0; text-align: center; border-top: 1px solid #1E293B;">
              <p style="margin: 0 0 12px 0; font-size: 11px; color: #64748B;">NASDAQ 기술적 분석 v3.0</p>
              <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(email)}" style="font-size: 11px; color: #475569; text-decoration: underline;">구독 취소</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function parseNasdaqAnalysis(jsonString: string): string {
  if (!jsonString?.trim()) {
    return generateEmptyState('데이터를 불러올 수 없습니다.');
  }

  const trimmed = jsonString.trim();
  if (!trimmed.startsWith('{')) {
    return generateEmptyState('분석 결과를 처리할 수 없습니다.');
  }

  try {
    const data = JSON.parse(trimmed) as NasdaqCompactResponse;
    const qualityBadge = generateDataQualityBadge(data.dataQuality);

    if (!data.picks?.length) {
      return `${qualityBadge}${generateEmptyState(data.noPicksReason || '오늘은 조건에 맞는 종목이 없습니다.')}`;
    }

    const pickCards = data.picks.map(generatePickCard).join('');
    const summary = generateSummary(data.summary);

    return `${qualityBadge}${pickCards}${summary}`;
  } catch {
    return generateEmptyState('분석 결과를 파싱할 수 없습니다.');
  }
}

function generateDataQualityBadge(quality: NasdaqCompactResponse['dataQuality']): string {
  const freshColor = quality.fresh ? '#10B981' : '#EF4444';
  const verifiedColor = quality.verified ? '#10B981' : '#EF4444';

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 16px;">
      <tr>
        <td style="padding: 12px 16px; background-color: #1E293B; border-radius: 8px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="font-size: 11px; color: #94A3B8;">${quality.source}</td>
              <td style="text-align: right;">
                <span style="font-size: 10px; color: ${freshColor}; margin-right: 12px;">${quality.fresh ? '✓' : '✗'} 최신</span>
                <span style="font-size: 10px; color: ${verifiedColor};">${quality.verified ? '✓' : '✗'} 검증됨</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function generatePickCard(pick: NasdaqPick): string {
  const strengthStyle = STRENGTH_STYLES[pick.strength];
  const confStyle = getConfidenceStyle(pick.confidence);

  const warningsHTML = pick.warnings.length
    ? pick.warnings
        .map(
          (w) =>
            `<span style="display: inline-block; padding: 2px 6px; margin-right: 4px; font-size: 9px; background-color: #FEF3C7; color: #CA8A04; border-radius: 3px;">${WARNING_LABELS[w] || w}</span>`
        )
        .join('')
    : '';

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px; background-color: #1E293B; border: 1px solid #334155; border-radius: 12px; overflow: hidden;">
      <tr>
        <td style="padding: 20px;">
          <!-- Rank + Ticker + Price -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 16px;">
            <tr>
              <td style="width: 36px; vertical-align: top;">
                <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10B981, #059669); border-radius: 8px; text-align: center; line-height: 32px; font-size: 14px; font-weight: 700; color: #FFFFFF;">#${pick.rank}</div>
              </td>
              <td style="padding-left: 12px; vertical-align: top;">
                <h2 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.01em;">${pick.ticker}</h2>
                <p style="margin: 0; font-size: 12px; color: #64748B;">${REGIME_LABELS[pick.regime]}</p>
              </td>
              <td style="text-align: right; vertical-align: top;">
                <p style="margin: 0 0 4px 0; font-size: 22px; font-weight: 700; color: #FFFFFF;">$${pick.price.toFixed(2)}</p>
                <span style="display: inline-block; padding: 3px 8px; font-size: 10px; font-weight: 600; background-color: ${strengthStyle.bg}; color: ${strengthStyle.text}; border-radius: 4px;">${strengthStyle.label}</span>
              </td>
            </tr>
          </table>
          <!-- Signal + Trigger -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 16px; padding: 12px; background-color: #0F172A; border-radius: 8px;">
            <tr>
              <td>
                <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 600; color: #10B981; text-transform: uppercase;">${pick.signal === 'MEAN_REVERSION' ? '📉' : '📈'} ${SIGNAL_LABELS[pick.signal]}</p>
                <p style="margin: 0; font-size: 13px; color: #E2E8F0; line-height: 1.5;">${pick.trigger}</p>
              </td>
            </tr>
          </table>
          <!-- Confidence Bar -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 16px;">
            <tr>
              <td>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 6px;">
                  <tr>
                    <td style="font-size: 11px; font-weight: 500; color: #94A3B8;">신뢰도</td>
                    <td style="text-align: right; font-size: 14px; font-weight: 700; color: ${confStyle.text};">${pick.confidence}%</td>
                  </tr>
                </table>
                <div style="width: 100%; height: 6px; background-color: #334155; border-radius: 3px; overflow: hidden;">
                  <div style="width: ${pick.confidence}%; height: 100%; background-color: ${confStyle.bar}; border-radius: 3px;"></div>
                </div>
              </td>
            </tr>
          </table>
          <!-- Technical Indicators -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="${pick.warnings.length ? 'margin-bottom: 12px;' : ''}">
            <tr>
              <td style="padding: 10px; background-color: #0F172A; border-radius: 8px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="width: 20%; text-align: center; padding: 4px;">
                      <p style="margin: 0 0 2px 0; font-size: 9px; color: #64748B;">WillR</p>
                      <p style="margin: 0; font-size: 12px; font-weight: 600; color: #FFFFFF;">${pick.indicators.willr.toFixed(1)}</p>
                    </td>
                    <td style="width: 20%; text-align: center; padding: 4px;">
                      <p style="margin: 0 0 2px 0; font-size: 9px; color: #64748B;">RSI</p>
                      <p style="margin: 0; font-size: 12px; font-weight: 600; color: #FFFFFF;">${pick.indicators.rsi.toFixed(1)}</p>
                    </td>
                    <td style="width: 20%; text-align: center; padding: 4px;">
                      <p style="margin: 0 0 2px 0; font-size: 9px; color: #64748B;">ADX</p>
                      <p style="margin: 0; font-size: 12px; font-weight: 600; color: #FFFFFF;">${pick.indicators.adx.toFixed(1)}</p>
                    </td>
                    <td style="width: 20%; text-align: center; padding: 4px;">
                      <p style="margin: 0 0 2px 0; font-size: 9px; color: #64748B;">ATR</p>
                      <p style="margin: 0; font-size: 12px; font-weight: 600; color: #FFFFFF;">${pick.indicators.atr.toFixed(2)}</p>
                    </td>
                    <td style="width: 20%; text-align: center; padding: 4px;">
                      <p style="margin: 0 0 2px 0; font-size: 9px; color: #64748B;">EMA20</p>
                      <p style="margin: 0; font-size: 12px; font-weight: 600; color: #FFFFFF;">$${pick.indicators.ema20.toFixed(0)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          ${pick.warnings.length ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td>${warningsHTML}</td></tr></table>` : ''}
        </td>
      </tr>
    </table>`;
}

function generateSummary(summary: NasdaqCompactResponse['summary']): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 8px; background-color: #1E293B; border: 1px solid #334155; border-radius: 8px;">
      <tr>
        <td style="padding: 16px;">
          <p style="margin: 0 0 12px 0; font-size: 11px; font-weight: 600; color: #10B981; text-transform: uppercase;">요약</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="width: 25%; text-align: center; padding: 8px; border-right: 1px solid #334155;">
                <p style="margin: 0 0 4px 0; font-size: 10px; color: #64748B;">추천 종목</p>
                <p style="margin: 0; font-size: 18px; font-weight: 700; color: #FFFFFF;">${summary.totalPicks}</p>
              </td>
              <td style="width: 25%; text-align: center; padding: 8px; border-right: 1px solid #334155;">
                <p style="margin: 0 0 4px 0; font-size: 10px; color: #64748B;">평균 신뢰도</p>
                <p style="margin: 0; font-size: 18px; font-weight: 700; color: #FFFFFF;">${summary.avgConfidence !== null ? `${summary.avgConfidence.toFixed(0)}%` : '-'}</p>
              </td>
              <td style="width: 25%; text-align: center; padding: 8px; border-right: 1px solid #334155;">
                <p style="margin: 0 0 4px 0; font-size: 10px; color: #64748B;">횡보장</p>
                <p style="margin: 0; font-size: 18px; font-weight: 700; color: #FFFFFF;">${summary.regimeA}</p>
              </td>
              <td style="width: 25%; text-align: center; padding: 8px;">
                <p style="margin: 0 0 4px 0; font-size: 10px; color: #64748B;">추세장</p>
                <p style="margin: 0; font-size: 18px; font-weight: 700; color: #FFFFFF;">${summary.regimeB}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function generateEmptyState(message: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 16px;">
      <tr>
        <td style="padding: 40px 24px; background-color: #1E293B; border-radius: 12px; text-align: center;">
          <p style="margin: 0 0 8px 0; font-size: 32px;">📭</p>
          <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #FFFFFF;">오늘의 추천 종목 없음</p>
          <p style="margin: 0; font-size: 13px; color: #94A3B8;">${message}</p>
        </td>
      </tr>
    </table>`;
}