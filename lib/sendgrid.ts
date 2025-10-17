import sgMail from '@sendgrid/mail';

// API 키 초기화 함수
function initSendGrid() {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY is required');
  }
  sgMail.setApiKey(apiKey);
  return true;
}

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface StockNewsletterData {
  geminiAnalysis: string;
  date: string;
}

interface StockSignals {
  trend_score: number;
  momentum_score: number;
  volume_score: number;
  volatility_score: number;
  pattern_score: number;
  sentiment_score: number;
  overall_score: number;
}

interface AnalysisDepth {
  indicators_collected: number;
  tier1_success: string;
  tier2_success: string;
  tier3_success: string;
  data_quality: string;
}

interface Evidence {
  verification_sources: number;
  golden_crosses: string[];
  technical_pattern: string;
}

interface StockData {
  name: string;
  ticker: string;
  close_price: number;
  rationale: string;
  signals: StockSignals;
  analysis_depth: AnalysisDepth;
  evidence: Evidence;
}

/**
 * SendGrid로 주식 뉴스레터 이메일 전송
 */
export async function sendStockNewsletter(
  recipients: EmailRecipient[],
  data: StockNewsletterData
): Promise<void> {
  // SendGrid 초기화
  initSendGrid();

  const subject = `[Stock Matrix] ${data.date} AI 기술적 분석`;

  try {
    // 각 수신자별로 개별 이메일 전송 (수신거부 링크 개인화)
    await Promise.all(
      recipients.map((recipient) => {
        const html = generateNewsletterHTML(data, recipient.email);
        return sgMail.send({
          to: recipient.email,
          from: {
            email: process.env.SENDGRID_FROM_EMAIL!,
            name: process.env.SENDGRID_FROM_NAME!,
          },
          subject,
          html,
        });
      })
    );

    console.log(`✅ 이메일 전송 완료: ${recipients.length}명`);
  } catch (error) {
    console.error('❌ SendGrid 이메일 전송 실패:', error);
    throw error;
  }
}

/**
 * 뉴스레터 HTML 템플릿 생성
 */
function generateNewsletterHTML(data: StockNewsletterData, email: string): string {
  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 기술적 지표 분석 데이터</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Noto Sans KR', 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; background-color: #F8FAFC;">
  <!-- Email Wrapper -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #F8FAFC;">
    <tr>
      <td style="padding: 40px 20px;">
        <!-- Main Container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 640px; margin: 0 auto; background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 24px; background-color: #0F172A; border-radius: 8px 8px 0 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 12px 0; padding: 0; font-size: 13px; font-weight: 600; color: #10B981; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1;">Stock Matrix</p>
                    <h1 style="margin: 0 0 8px 0; padding: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.03em; color: #FFFFFF; line-height: 1.2;">오늘의 AI 기술적 분석</h1>
                    <p style="margin: 0 0 12px 0; padding: 0; font-size: 14px; font-weight: 400; color: #94A3B8; letter-spacing: 0.02em; line-height: 1.5;">기술적 지표 기반 5개 종목 분석</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                      <tr>
                        <td style="padding: 6px 16px; background-color: #1E293B; border: 1px solid #334155; border-radius: 6px;">
                          <span style="font-size: 12px; font-weight: 500; color: #E2E8F0; letter-spacing: 0.01em;">${data.date}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 24px;">

              <!-- Stock Items -->
              ${parseAndFormatAnalysis(data.geminiAnalysis)}

              <!-- Disclaimer -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 32px;">
                <tr>
                  <td style="padding: 18px 20px; background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px;">
                    <p style="margin: 0 0 10px 0; padding: 0; font-size: 12px; font-weight: 700; color: #DC2626; line-height: 1.6;">⚠️ 법적 고지 및 투자 유의사항</p>
                    <p style="margin: 0; padding: 0; font-size: 11px; font-weight: 400; color: #64748B; line-height: 1.8;">본 서비스는 인공지능(AI)을 활용하여 기술적 지표를 수집·분석한 참고 자료를 제공하는 정보 제공 서비스로서, 자본시장과 금융투자업에 관한 법률 제6조에 따른 투자권유, 투자자문, 투자일임 등 어떠한 형태의 금융투자업 행위도 아니며, 특정 종목의 매수·매도·보유를 권유하거나 추천하지 않습니다. 제공되는 모든 정보는 교육 및 정보 제공 목적으로만 사용되어야 하며, 투자 판단 및 최종 의사결정에 대한 책임은 전적으로 이용자 본인에게 있습니다. 본 서비스는 구체적인 매수가격, 매도가격, 손절가, 목표가격 등 거래 실행과 관련된 어떠한 정보도 제시하지 않으며, 모든 매매 시점, 수량, 가격 결정은 투자자 본인의 독립적인 판단에 따라 이루어져야 합니다. AI 분석 결과 및 과거 데이터는 미래의 투자 수익률을 보장하지 않으며, 주식 투자에는 원금 손실의 위험이 항상 존재합니다. 시장 상황, 경제 지표, 기업 실적, 정치적 요인 등 다양한 변수에 따라 주가는 예측과 다르게 변동할 수 있으며, 투자 손실에 대한 모든 책임은 투자자 본인에게 귀속됩니다. 본 서비스의 운영자 및 정보 제공자는 본 정보의 정확성, 완전성, 적시성을 보장하지 않으며, 본 정보를 이용하여 발생한 투자 손실, 기회 손실, 데이터 오류, 시스템 장애 등 어떠한 직접적·간접적·부수적·파생적 손해에 대해서도 법적 책임을 지지 않습니다. 투자자는 본인의 투자 목적, 재무 상태, 위험 감수 능력을 충분히 고려하여 신중하게 투자 결정을 내려야 하며, 필요한 경우 금융 전문가와 상담할 것을 권장합니다.</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px; background-color: #F8FAFC; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 16px 0; padding: 0; font-size: 12px; font-weight: 400; color: #94A3B8; line-height: 1.5;">Stock Matrix</p>
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?email=${encodeURIComponent(email)}" style="display: inline-block; padding: 8px 16px; font-size: 12px; font-weight: 500; color: #64748B; text-decoration: none; border: 1px solid #E2E8F0; border-radius: 6px; transition: all 0.2s;">구독 취소</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * JSON 분석 결과를 HTML로 변환
 */
function parseAndFormatAnalysis(jsonString: string): string {
  // 빈 문자열이거나 데이터가 없으면 "서비스 준비 중" 메시지 표시
  if (!jsonString || jsonString.trim() === '') {
    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding: 32px 20px; text-align: center; background-color: #F8FAFC; border-radius: 8px;">
            <p style="margin: 0; padding: 0; font-size: 14px; font-weight: 500; color: #64748B;">서비스 준비 중입니다.</p>
          </td>
        </tr>
      </table>
    `;
  }

  // JSON 형식이 아닌 경우 (에러 메시지 또는 일반 텍스트)
  const trimmed = jsonString.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    console.warn('비-JSON 응답 감지:', trimmed.substring(0, 100));
    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding: 32px 20px; text-align: center; background-color: #F8FAFC; border-radius: 8px;">
            <p style="margin: 0; padding: 0; font-size: 14px; font-weight: 500; color: #64748B;">서비스 준비 중입니다.</p>
          </td>
        </tr>
      </table>
    `;
  }

  try {
    const stocks = JSON.parse(jsonString);

    // 파싱은 되었지만 배열이 비어있는 경우
    if (!stocks || stocks.length === 0) {
      return `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="padding: 32px 20px; text-align: center; background-color: #F8FAFC; border-radius: 8px;">
              <p style="margin: 0; padding: 0; font-size: 14px; font-weight: 500; color: #64748B;">서비스 준비 중입니다.</p>
            </td>
          </tr>
        </table>
      `;
    }

    // 종합점수 내림차순 정렬
    const sortedStocks = stocks.sort((a: StockData, b: StockData) =>
      b.signals.overall_score - a.signals.overall_score
    );

    return sortedStocks
      .map(
        (stock: StockData, index: number) => `
        <!-- Stock Card -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="${index < sortedStocks.length - 1 ? 'margin-bottom: 12px;' : ''} background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 16px;">

              <!-- Stock Header -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #F1F5F9;">
                <tr>
                  <td style="vertical-align: top; width: 60%;">
                    <h3 style="margin: 0 0 6px 0; padding: 0; font-size: 18px; font-weight: 600; color: #0F172A; letter-spacing: -0.02em; line-height: 1.2;">${stock.name}</h3>
                    <p style="margin: 0; padding: 0; font-size: 12px; font-weight: 500; color: #94A3B8; letter-spacing: 0.02em; text-transform: uppercase; line-height: 1;">${stock.ticker}</p>
                  </td>
                  <td style="vertical-align: top; width: 40%; text-align: right;">
                    <p style="margin: 0 0 6px 0; padding: 0; font-size: 11px; font-weight: 500; color: #94A3B8; text-align: right;">전일 종가</p>
                    <div style="display: inline-block; padding: 6px 10px; background-color: #F8FAFC; border-radius: 6px; white-space: nowrap;">
                      <span style="font-size: 15px; font-weight: 700; color: #0F172A; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1;">${stock.close_price.toLocaleString()}</span>
                      <span style="font-size: 11px; font-weight: 500; color: #64748B;">원</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Rationale -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    ${stock.rationale
                      .split('|')
                      .map(
                        (r: string) => `
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 8px;">
                        <tr>
                          <td style="width: 6px; vertical-align: top; padding-top: 9px;">
                            <span style="display: block; width: 4px; height: 4px; background-color: #0EA5E9; border-radius: 50%;"></span>
                          </td>
                          <td style="width: 8px;"></td>
                          <td style="font-size: 14px; font-weight: 400; color: #475569; line-height: 1.6;">${r.trim()}</td>
                        </tr>
                      </table>
                    `
                      )
                      .join('')}
                  </td>
                </tr>
              </table>

              <!-- Technical Signals Scores -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #F1F5F9;">
                <!-- Section Title: 기술적 신호 점수 -->
                <tr>
                  <td colspan="2" style="padding: 0 0 16px 0;">
                    <p style="margin: 0; padding: 0; font-size: 11px; font-weight: 600; color: #0EA5E9; letter-spacing: 0.05em; text-transform: uppercase;">기술적 신호 점수</p>
                  </td>
                </tr>

                <!-- Trend Score -->
                <tr>
                  <td style="width: 40%; padding: 8px 0;">
                    <p style="margin: 0; padding: 0; font-size: 13px; font-weight: 500; color: #64748B;">추세 점수</p>
                  </td>
                  <td style="width: 60%; padding: 8px 0; text-align: right;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: ${stock.signals.trend_score >= 70 ? '#DCFCE7' : stock.signals.trend_score >= 40 ? '#FEF3C7' : '#FEE2E2'}; border-radius: 4px; font-size: 15px; font-weight: 700; color: ${stock.signals.trend_score >= 70 ? '#15803D' : stock.signals.trend_score >= 40 ? '#CA8A04' : '#DC2626'};">${stock.signals.trend_score}점</span>
                  </td>
                </tr>

                <!-- Momentum Score -->
                <tr>
                  <td style="width: 40%; padding: 8px 0;">
                    <p style="margin: 0; padding: 0; font-size: 13px; font-weight: 500; color: #64748B;">모멘텀 점수</p>
                  </td>
                  <td style="width: 60%; padding: 8px 0; text-align: right;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: ${stock.signals.momentum_score >= 70 ? '#DCFCE7' : stock.signals.momentum_score >= 40 ? '#FEF3C7' : '#FEE2E2'}; border-radius: 4px; font-size: 15px; font-weight: 700; color: ${stock.signals.momentum_score >= 70 ? '#15803D' : stock.signals.momentum_score >= 40 ? '#CA8A04' : '#DC2626'};">${stock.signals.momentum_score}점</span>
                  </td>
                </tr>

                <!-- Volume Score -->
                <tr>
                  <td style="width: 40%; padding: 8px 0;">
                    <p style="margin: 0; padding: 0; font-size: 13px; font-weight: 500; color: #64748B;">거래량 점수</p>
                  </td>
                  <td style="width: 60%; padding: 8px 0; text-align: right;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: ${stock.signals.volume_score >= 70 ? '#DCFCE7' : stock.signals.volume_score >= 40 ? '#FEF3C7' : '#FEE2E2'}; border-radius: 4px; font-size: 15px; font-weight: 700; color: ${stock.signals.volume_score >= 70 ? '#15803D' : stock.signals.volume_score >= 40 ? '#CA8A04' : '#DC2626'};">${stock.signals.volume_score}점</span>
                  </td>
                </tr>

                <!-- Volatility Score -->
                <tr>
                  <td style="width: 40%; padding: 8px 0;">
                    <p style="margin: 0; padding: 0; font-size: 13px; font-weight: 500; color: #64748B;">변동성 점수</p>
                  </td>
                  <td style="width: 60%; padding: 8px 0; text-align: right;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: ${stock.signals.volatility_score >= 70 ? '#DCFCE7' : stock.signals.volatility_score >= 40 ? '#FEF3C7' : '#FEE2E2'}; border-radius: 4px; font-size: 15px; font-weight: 700; color: ${stock.signals.volatility_score >= 70 ? '#15803D' : stock.signals.volatility_score >= 40 ? '#CA8A04' : '#DC2626'};">${stock.signals.volatility_score}점</span>
                  </td>
                </tr>

                <!-- Pattern Score -->
                <tr>
                  <td style="width: 40%; padding: 8px 0;">
                    <p style="margin: 0; padding: 0; font-size: 13px; font-weight: 500; color: #64748B;">패턴 점수</p>
                  </td>
                  <td style="width: 60%; padding: 8px 0; text-align: right;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: ${stock.signals.pattern_score >= 70 ? '#DCFCE7' : stock.signals.pattern_score >= 40 ? '#FEF3C7' : '#FEE2E2'}; border-radius: 4px; font-size: 15px; font-weight: 700; color: ${stock.signals.pattern_score >= 70 ? '#15803D' : stock.signals.pattern_score >= 40 ? '#CA8A04' : '#DC2626'};">${stock.signals.pattern_score}점</span>
                  </td>
                </tr>

                <!-- Sentiment Score -->
                <tr>
                  <td style="width: 40%; padding: 8px 0;">
                    <p style="margin: 0; padding: 0; font-size: 13px; font-weight: 500; color: #64748B;">심리 점수</p>
                  </td>
                  <td style="width: 60%; padding: 8px 0; text-align: right;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: ${stock.signals.sentiment_score >= 70 ? '#DCFCE7' : stock.signals.sentiment_score >= 40 ? '#FEF3C7' : '#FEE2E2'}; border-radius: 4px; font-size: 15px; font-weight: 700; color: ${stock.signals.sentiment_score >= 70 ? '#15803D' : stock.signals.sentiment_score >= 40 ? '#CA8A04' : '#DC2626'};">${stock.signals.sentiment_score}점</span>
                  </td>
                </tr>

                <!-- Spacing -->
                <tr><td colspan="2" style="height: 12px; border-bottom: 1px solid #F1F5F9;"></td></tr>

                <!-- Overall Score -->
                <tr>
                  <td style="width: 40%; padding: 12px 0 0 0; vertical-align: middle;">
                    <p style="margin: 0; padding: 0; font-size: 16px; font-weight: 600; color: #0F172A; line-height: 1;">종합 점수</p>
                  </td>
                  <td style="width: 60%; padding: 12px 0 0 0; text-align: right; vertical-align: middle;">
                    <span style="display: inline-block; padding: 8px 18px; background-color: ${stock.signals.overall_score >= 70 ? '#10B981' : stock.signals.overall_score >= 40 ? '#F59E0B' : '#EF4444'}; border-radius: 6px; font-size: 18px; font-weight: 700; color: #FFFFFF; line-height: 1;">${stock.signals.overall_score}점</span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      `
      )
      .join('');
  } catch (error) {
    console.error('JSON 파싱 실패:', error);
    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding: 24px; text-align: center;">
            <p style="margin: 0; padding: 0; font-size: 14px; font-weight: 500; color: #DC2626;">분석 결과를 표시할 수 없습니다.</p>
          </td>
        </tr>
      </table>
    `;
  }
}
