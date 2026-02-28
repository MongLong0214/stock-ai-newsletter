const BASE_URL = process.env.STOCKMATRIX_API_URL || 'https://stockmatrix.co.kr';
export const fetchApi = async (path, params) => {
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
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    const json = (await response.json());
    if (json !== null &&
        typeof json === 'object' &&
        'success' in json &&
        'data' in json) {
        const wrapped = json;
        if (!wrapped.success) {
            throw new Error(wrapped.error?.message || 'API returned unsuccessful response');
        }
        return wrapped.data;
    }
    return json;
};
export const formatResult = (data) => JSON.stringify(data, null, 2);
export const formatError = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
};
