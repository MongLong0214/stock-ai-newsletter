const BASE_URL = process.env.STOCKMATRIX_API_URL || 'https://stockmatrix.co.kr';
// 시작 시 URL 유효성 검증
try {
    new URL(BASE_URL);
}
catch {
    throw new Error(`Invalid STOCKMATRIX_API_URL: "${BASE_URL}" is not a valid URL`);
}
const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1_000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const isRetryable = (error) => {
    if (error instanceof Error) {
        const msg = error.message;
        return (msg.includes('ECONNRESET') ||
            msg.includes('ETIMEDOUT') ||
            msg.includes('UND_ERR_CONNECT_TIMEOUT') ||
            msg.includes('fetch failed') ||
            RETRYABLE_STATUS.has(Number(msg.match(/API request failed: (\d+)/)?.[1])));
    }
    return false;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const fetchApi = async (path, params) => {
    const url = new URL(path, BASE_URL);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
    }
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
        }
        try {
            const response = await fetch(url.toString(), {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                const preview = await response.text().catch(() => '');
                throw new Error(`Expected JSON response but got ${contentType || 'unknown'}: ${preview.slice(0, 200)}`);
            }
            const json = await response.json();
            if (json === null || json === undefined) {
                throw new Error('API returned null or undefined response');
            }
            if (typeof json === 'object' &&
                json !== null &&
                'success' in json &&
                'data' in json) {
                const wrapped = json;
                if (!wrapped.success) {
                    throw new Error(wrapped.error?.message || 'API returned unsuccessful response');
                }
                return wrapped.data;
            }
            return json;
        }
        catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES && isRetryable(error)) {
                continue;
            }
            throw error;
        }
    }
    throw lastError;
};
export const formatResult = (data) => JSON.stringify(data, null, 2);
export const formatError = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
};
