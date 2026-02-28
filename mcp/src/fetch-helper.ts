const BASE_URL =
  process.env.STOCKMATRIX_API_URL || 'https://stockmatrix.co.kr';

// 시작 시 URL 유효성 검증
try {
  new URL(BASE_URL);
} catch {
  throw new Error(
    `Invalid STOCKMATRIX_API_URL: "${BASE_URL}" is not a valid URL`
  );
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { message: string };
}

export const fetchApi = async <T = unknown>(
  path: string,
  params?: Record<string, string>
): Promise<T> => {
  const url = new URL(path, BASE_URL);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `API request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const preview = await response.text().catch(() => '');
    throw new Error(
      `Expected JSON response but got ${contentType || 'unknown'}: ${preview.slice(0, 200)}`
    );
  }

  const json = (await response.json()) as ApiResponse<T> | T;

  if (
    json !== null &&
    typeof json === 'object' &&
    'success' in json &&
    'data' in json
  ) {
    const wrapped = json as ApiResponse<T>;
    if (!wrapped.success) {
      throw new Error(
        wrapped.error?.message || 'API returned unsuccessful response'
      );
    }
    return wrapped.data;
  }

  return json as T;
};

export const formatResult = (data: unknown): string =>
  JSON.stringify(data, null, 2);

export const formatError = (error: unknown): string => {
  const message =
    error instanceof Error ? error.message : String(error);
  return `Error: ${message}`;
};
