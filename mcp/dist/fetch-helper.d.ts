export declare const fetchApi: <T = unknown>(path: string, params?: Record<string, string>) => Promise<T>;
export declare const formatResult: (data: unknown) => string;
export declare const formatError: (error: unknown) => string;
