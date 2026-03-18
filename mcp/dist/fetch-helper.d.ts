export declare const fetchApi: <T = unknown>(path: string, params?: Record<string, string>) => Promise<T>;
/** JSON 직렬화 with optional context header for AI agents */
export declare const formatResult: (data: unknown, context?: string) => string;
export declare const formatError: (error: unknown) => string;
