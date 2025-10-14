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
  gptAnalysis: string;
  claudeAnalysis: string;
  geminiAnalysis: string;
  date: string;
}

interface StockLevels {
  entry1: number;
  sl1: number;
  entry2: number;
  sl2: number;
  entry3: number;
  sl3: number;
}

interface StockData {
  name: string;
  ticker: string;
  close_price: number;
  rationale: string;
  levels: StockLevels;
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

  const subject = `[Stock Matrix] ${data.date} 추천 종목 분석`;

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
  <title>오늘의 추천 종목 분석</title>
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
                    <h1 style="margin: 0 0 8px 0; padding: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.03em; color: #FFFFFF; line-height: 1.2;">오늘의 AI 추천 종목</h1>
                    <p style="margin: 0 0 12px 0; padding: 0; font-size: 14px; font-weight: 400; color: #94A3B8; letter-spacing: 0.02em; line-height: 1.5;">3개 AI, 각 3종목씩 총 9개</p>
                    <div style="display: inline-block; padding: 6px 16px; background-color: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px;">
                      <span style="font-size: 12px; font-weight: 500; color: #E2E8F0; letter-spacing: 0.01em;">${data.date}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 24px;">

              <!-- GPT-5 Analysis -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <!-- AI Header -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #E2E8F0;">
                      <tr>
                        <td style="vertical-align: middle;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="padding: 6px 14px; background-color: #10B981; border-radius: 6px; vertical-align: middle;">
                                <span style="font-size: 11px; font-weight: 600; color: #FFFFFF; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1;">GPT</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Stock Items -->
                    ${parseAndFormatAnalysis(data.gptAnalysis)}
                  </td>
                </tr>
              </table>

              <!-- Claude Opus 4.1 Analysis -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <!-- AI Header -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #E2E8F0;">
                      <tr>
                        <td style="vertical-align: middle;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="padding: 6px 14px; background-color: #8B5CF6; border-radius: 6px; vertical-align: middle;">
                                <span style="font-size: 11px; font-weight: 600; color: #FFFFFF; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1;">CLAUDE</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Stock Items -->
                    ${parseAndFormatAnalysis(data.claudeAnalysis)}
                  </td>
                </tr>
              </table>

              <!-- Gemini-2.5 Pro Analysis -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 20px;">
                <tr>
                  <td>
                    <!-- AI Header -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #E2E8F0;">
                      <tr>
                        <td style="vertical-align: middle;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="padding: 6px 14px; background-color: #0EA5E9; border-radius: 6px; vertical-align: middle;">
                                <span style="font-size: 11px; font-weight: 600; color: #FFFFFF; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1;">GEMINI</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Stock Items -->
                    ${parseAndFormatAnalysis(data.geminiAnalysis)}
                  </td>
                </tr>
              </table>

              <!-- Disclaimer -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td style="padding: 16px 20px; background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px;">
                    <p style="margin: 0 0 8px 0; padding: 0; font-size: 11px; font-weight: 600; color: #DC2626; line-height: 1.6;">⚠️ 투자 유의사항</p>
                    <p style="margin: 0 0 6px 0; padding: 0; font-size: 11px; font-weight: 400; color: #64748B; line-height: 1.6;">• 본 정보는 AI가 생성한 참고 자료이며, 투자 권유 및 매매 추천이 아닙니다.</p>
                    <p style="margin: 0 0 6px 0; padding: 0; font-size: 11px; font-weight: 400; color: #64748B; line-height: 1.6;">• 투자의 최종 결정과 그에 따른 손익은 투자자 본인에게 귀속됩니다.</p>
                    <p style="margin: 0; padding: 0; font-size: 11px; font-weight: 400; color: #64748B; line-height: 1.6;">• 과거 데이터 및 AI 분석 결과가 미래 수익을 보장하지 않습니다.</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px; background-color: #F8FAFC; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 16px 0; padding: 0; font-size: 12px; font-weight: 400; color: #94A3B8; line-height: 1.5;">Stock Matrix</p>
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?email=${encodeURIComponent(email)}" style="display: inline-block; padding: 8px 16px; font-size: 12px; font-weight: 500; color: #64748B; text-decoration: none; border: 1px solid #E2E8F0; border-radius: 6px; transition: all 0.2s;">수신거부</a>
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

    return stocks
      .map(
        (stock: StockData) => `
        <!-- Stock Card -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
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
                    <div style="display: inline-block; padding: 8px 12px; background-color: #F8FAFC; border-radius: 6px;">
                      <span style="font-size: 18px; font-weight: 700; color: #0F172A; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1;">${stock.close_price.toLocaleString()}</span>
                      <span style="font-size: 12px; font-weight: 500; color: #64748B;">원</span>
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
                          <td style="width: 20px; vertical-align: top; padding-top: 2px;">
                            <span style="display: inline-block; width: 4px; height: 4px; background-color: #0EA5E9; border-radius: 50%; margin-right: 12px;"></span>
                          </td>
                          <td style="font-size: 14px; font-weight: 400; color: #475569; line-height: 1.6;">${r.trim()}</td>
                        </tr>
                      </table>
                    `
                      )
                      .join('')}
                  </td>
                </tr>
              </table>

              <!-- Entry & Stop-Loss Levels -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #F1F5F9;">
                <!-- Section Title: 진입 기회 -->
                <tr>
                  <td colspan="3" style="padding: 0 0 12px 0;">
                    <p style="margin: 0; padding: 0; font-size: 11px; font-weight: 600; color: #059669; letter-spacing: 0.05em; text-transform: uppercase;">진입 기회</p>
                  </td>
                </tr>
                <!-- Entry Levels Row -->
                <tr>
                  <!-- Entry 1 -->
                  <td style="width: 33.33%; padding: 0 4px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px;">
                      <tr>
                        <td style="padding: 12px; text-align: center;">
                          <p style="margin: 0 0 6px 0; padding: 0; font-size: 10px; font-weight: 600; color: #059669; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1;">1단계</p>
                          <p style="margin: 0; padding: 0; font-size: 16px; font-weight: 700; color: #047857; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; line-height: 1;">${stock.levels.entry1.toLocaleString()}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Entry 2 -->
                  <td style="width: 33.33%; padding: 0 4px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px;">
                      <tr>
                        <td style="padding: 12px; text-align: center;">
                          <p style="margin: 0 0 6px 0; padding: 0; font-size: 10px; font-weight: 600; color: #059669; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1;">2단계</p>
                          <p style="margin: 0; padding: 0; font-size: 16px; font-weight: 700; color: #047857; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; line-height: 1;">${stock.levels.entry2.toLocaleString()}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Entry 3 -->
                  <td style="width: 33.33%; padding: 0 4px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px;">
                      <tr>
                        <td style="padding: 12px; text-align: center;">
                          <p style="margin: 0 0 6px 0; padding: 0; font-size: 10px; font-weight: 600; color: #059669; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1;">3단계</p>
                          <p style="margin: 0; padding: 0; font-size: 16px; font-weight: 700; color: #047857; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; line-height: 1;">${stock.levels.entry3.toLocaleString()}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Spacing -->
                <tr><td colspan="3" style="height: 16px;"></td></tr>

                <!-- Section Title: 손절 라인 -->
                <tr>
                  <td colspan="3" style="padding: 0 0 12px 0;">
                    <p style="margin: 0; padding: 0; font-size: 11px; font-weight: 600; color: #DC2626; letter-spacing: 0.05em; text-transform: uppercase;">손절 라인</p>
                  </td>
                </tr>
                <!-- Stop-Loss Levels Row -->
                <tr>
                  <!-- Stop-Loss 1 -->
                  <td style="width: 33.33%; padding: 0 4px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px;">
                      <tr>
                        <td style="padding: 12px; text-align: center;">
                          <p style="margin: 0 0 6px 0; padding: 0; font-size: 10px; font-weight: 600; color: #DC2626; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1;">1단계</p>
                          <p style="margin: 0; padding: 0; font-size: 16px; font-weight: 700; color: #B91C1C; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; line-height: 1;">${stock.levels.sl1.toLocaleString()}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Stop-Loss 2 -->
                  <td style="width: 33.33%; padding: 0 4px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px;">
                      <tr>
                        <td style="padding: 12px; text-align: center;">
                          <p style="margin: 0 0 6px 0; padding: 0; font-size: 10px; font-weight: 600; color: #DC2626; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1;">2단계</p>
                          <p style="margin: 0; padding: 0; font-size: 16px; font-weight: 700; color: #B91C1C; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; line-height: 1;">${stock.levels.sl2.toLocaleString()}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Stop-Loss 3 -->
                  <td style="width: 33.33%; padding: 0 4px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px;">
                      <tr>
                        <td style="padding: 12px; text-align: center;">
                          <p style="margin: 0 0 6px 0; padding: 0; font-size: 10px; font-weight: 600; color: #DC2626; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1;">3단계</p>
                          <p style="margin: 0; padding: 0; font-size: 16px; font-weight: 700; color: #B91C1C; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; line-height: 1;">${stock.levels.sl3.toLocaleString()}</p>
                        </td>
                      </tr>
                    </table>
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

/**
 * 테스트 이메일 전송
 */
export async function sendTestEmail(to: string): Promise<void> {
  // SendGrid 초기화
  initSendGrid();

  try {
    await sgMail.send({
      to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL!,
        name: process.env.SENDGRID_FROM_NAME!,
      },
      subject: '[테스트] 주식 AI 뉴스레터',
      html: '<h1>SendGrid 연동 테스트 성공!</h1><p>주식 AI 뉴스레터가 정상적으로 작동합니다.</p>',
    });

    console.log('✅ 테스트 이메일 전송 완료');
  } catch (error) {
    console.error('❌ 테스트 이메일 전송 실패:', error);
    throw error;
  }
}