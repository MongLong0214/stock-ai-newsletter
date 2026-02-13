import { GoogleAuth } from 'google-auth-library';

const INDEXING_API = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const SCOPES = ['https://www.googleapis.com/auth/indexing'];

function getAuth(): GoogleAuth {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL 또는 GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY 누락');
  }

  return new GoogleAuth({
    credentials: { client_email: email, private_key: key.replace(/\\n/g, '\n') },
    scopes: SCOPES,
  });
}

export async function notifyGoogleIndexing(url: string): Promise<boolean> {
  try {
    const auth = getAuth();
    const client = await auth.getClient();
    const res = await client.request({
      url: INDEXING_API,
      method: 'POST',
      data: { url, type: 'URL_UPDATED' },
    });

    console.log(`📡 Google Indexing: ${url} → ${(res as { status: number }).status}`);
    return true;
  } catch (e) {
    console.error(`⚠️ Google Indexing 실패 (${url}):`, e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function notifyGoogleIndexingBatch(urls: string[]): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const url of urls) {
    const ok = await notifyGoogleIndexing(url);
    if (ok) success++;
    else failed++;
  }

  console.log(`📡 Google Indexing 배치: ✅${success} ❌${failed}`);
  return { success, failed };
}
