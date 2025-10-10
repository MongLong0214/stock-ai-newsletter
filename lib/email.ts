import { Resend } from 'resend';
import sgMail from '@sendgrid/mail';
import { z } from 'zod';

const emailSchema = z.string().email();

// Email provider 선택 (SENDGRID_API_KEY가 있으면 SendGrid, 없으면 Resend)
const useSendGrid = !!process.env.SENDGRID_API_KEY;

if (useSendGrid) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
} else {
  var resend = new Resend(process.env.RESEND_API_KEY);
}

type Recommendations = {
  gpt: string;
  claude: string;
  gemini: string;
};

export async function sendStockEmail(
  email: string,
  name: string | null,
  recommendations: Recommendations
): Promise<{ success: boolean; error?: unknown }> {
  try {
    if (!emailSchema.safeParse(email).success) {
      throw new Error('Invalid email address');
    }

    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });

    const greeting = name?.trim() ? `${name.trim()}님` : '구독자님';

    const fromEmail = process.env.EMAIL_FROM || 'AI 주식 추천 <onboarding@resend.dev>';
    const subject = `[${today}] AI 주식 추천`;
    const html = generateEmailHTML(greeting, today, recommendations, email);

    if (useSendGrid) {
      // SendGrid로 발송
      await sgMail.send({
        to: email,
        from: fromEmail,
        subject,
        html,
      });
    } else {
      // Resend로 발송
      const { error } = await resend!.emails.send({
        from: fromEmail,
        to: email,
        subject,
        html,
      });

      if (error) {
        throw error;
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error };
  }
}

type Stock = {
  ticker: string;
  name: string;
  current_price: number;
  rationale: string;
  entry_price: number;
  stop_loss: number;
};

function parseStockRecommendation(jsonText: string): Stock[] {
  try {
    const cleanText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanText);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderStockTable(stocks: Stock[]): string {
  if (stocks.length === 0) {
    return '<p style="color:#666;font-style:italic;">데이터를 불러올 수 없습니다.</p>';
  }

  const rows = stocks.map((stock, index) => `
    <tr style="border-bottom:1px solid #e9ecef;">
      <td style="padding:16px 12px;text-align:center;font-weight:600;color:#667eea;background-color:#f8f9fa;">${index + 1}</td>
      <td style="padding:16px 12px;">
        <div style="font-weight:600;color:#333;font-size:15px;margin-bottom:4px;">${stock.name}</div>
        <div style="font-size:12px;color:#6c757d;">${stock.ticker}</div>
      </td>
      <td style="padding:16px 12px;text-align:right;">
        <div style="font-weight:600;color:#333;margin-bottom:2px;">${stock.current_price.toLocaleString()}원</div>
        <div style="font-size:11px;color:#28a745;">진입: ${stock.entry_price.toLocaleString()}원</div>
        <div style="font-size:11px;color:#dc3545;">손절: ${stock.stop_loss.toLocaleString()}원</div>
      </td>
    </tr>
    <tr>
      <td colspan="3" style="padding:12px 16px;background-color:#f8f9fa;border-bottom:2px solid #dee2e6;">
        <div style="font-size:13px;color:#495057;line-height:1.6;">
          ${stock.rationale.split('|').map(r => `<span style="display:inline-block;margin:2px 8px 2px 0;">▪ ${r.trim()}</span>`).join('')}
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <table style="width:100%;border-collapse:collapse;background-color:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <thead>
        <tr style="background-color:#667eea;color:#fff;">
          <th style="padding:12px;text-align:center;width:50px;">순위</th>
          <th style="padding:12px;text-align:left;">종목</th>
          <th style="padding:12px;text-align:right;width:140px;">가격</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function generateEmailHTML(
  greeting: string,
  today: string,
  recommendations: Recommendations,
  email: string
): string {
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const gptStocks = parseStockRecommendation(recommendations.gpt);
  const claudeStocks = parseStockRecommendation(recommendations.claude);
  const geminiStocks = parseStockRecommendation(recommendations.gemini);

  const gptHtml = gptStocks.length > 0 ? renderStockTable(gptStocks) : `<div style="color:#666;font-size:14px;font-style:italic;">${escapeHtml(recommendations.gpt)}</div>`;
  const claudeHtml = claudeStocks.length > 0 ? renderStockTable(claudeStocks) : `<div style="color:#666;font-size:14px;font-style:italic;">${escapeHtml(recommendations.claude)}</div>`;
  const geminiHtml = geminiStocks.length > 0 ? renderStockTable(geminiStocks) : `<div style="color:#666;font-size:14px;font-style:italic;">${escapeHtml(recommendations.gemini)}</div>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 주식 추천</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:40px 20px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">🤖 AI 주식 추천</h1>
      <p style="color:#ffffff;margin:10px 0 0 0;font-size:14px;opacity:0.9;">${today}</p>
    </div>
    <div style="padding:40px 30px;">
      <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 30px 0;">안녕하세요, ${escapeHtml(greeting)}!<br>오늘의 AI 주식 추천을 전해드립니다.</p>
      <div style="margin-bottom:30px;border-left:4px solid #10a37f;background-color:#f8f9fa;padding:20px;border-radius:8px;">
        <h2 style="color:#10a37f;margin:0 0 15px 0;font-size:20px;">🤖 ChatGPT 추천</h2>
        ${gptHtml}
      </div>
      <div style="margin-bottom:30px;border-left:4px solid #d97706;background-color:#fef3c7;padding:20px;border-radius:8px;">
        <h2 style="color:#d97706;margin:0 0 15px 0;font-size:20px;">🤖 Claude 추천</h2>
        ${claudeHtml}
      </div>
      <div style="margin-bottom:30px;border-left:4px solid #4285f4;background-color:#e8f0fe;padding:20px;border-radius:8px;">
        <h2 style="color:#4285f4;margin:0 0 15px 0;font-size:20px;">🤖 Gemini 추천</h2>
        ${geminiHtml}
      </div>
      <div style="margin-top:40px;padding:20px;background-color:#fff3cd;border-radius:8px;border:1px solid #ffc107;">
        <p style="color:#856404;font-size:13px;margin:0;line-height:1.6;">⚠️ <strong>투자 유의사항</strong><br>본 정보는 AI가 생성한 참고 자료이며, 투자 권유가 아닙니다. 투자의 최종 결정은 본인의 판단과 책임 하에 이루어져야 하며, 투자로 인한 손실에 대해서는 책임지지 않습니다.</p>
      </div>
    </div>
    <div style="background-color:#f8f9fa;padding:30px;text-align:center;border-top:1px solid #e9ecef;">
      <p style="color:#6c757d;font-size:12px;margin:0 0 10px 0;">이 메일은 구독 신청에 따라 발송되었습니다.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?email=${encodeURIComponent(email)}" style="color:#6c757d;font-size:12px;text-decoration:underline;">구독 취소</a>
    </div>
  </div>
</body>
</html>`;
}