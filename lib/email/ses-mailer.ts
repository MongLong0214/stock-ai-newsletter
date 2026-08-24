/**
 * AWS SES(v2) 발송 클라이언트 — SendGrid 대체용.
 * EMAIL_PROVIDER=ses 일 때 sendStockNewsletter가 이 경로를 사용한다.
 * 자격증명은 표준 AWS 환경변수(AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)에서 해석.
 */

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

let client: SESv2Client | null = null;

function getClient(): SESv2Client {
  if (!client) {
    client = new SESv2Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });
  }
  return client;
}

/** 단일 수신자에게 HTML 이메일 발송 (수신거부 링크가 본문에 개인화되어 있음) */
export async function sendOneEmailViaSes(params: {
  to: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  html: string;
}): Promise<void> {
  const from = params.fromName
    ? `${params.fromName} <${params.fromEmail}>`
    : params.fromEmail;

  await getClient().send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [params.to] },
      Content: {
        Simple: {
          Subject: { Data: params.subject, Charset: 'UTF-8' },
          Body: { Html: { Data: params.html, Charset: 'UTF-8' } },
        },
      },
    })
  );
}
