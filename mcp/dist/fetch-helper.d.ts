import type { ZodType } from 'zod';
export declare const fetchApi: <T = unknown>(path: string, params?: Record<string, string>, schema?: ZodType<T>) => Promise<T>;
/** JSON 직렬화 with optional context header for AI agents */
export declare const formatResult: (data: unknown, context?: string) => string;
export declare const formatError: (error: unknown) => string;
/** 빈 결과에 가이던스 메시지를 포함하는 포맷터 */
export declare const formatEmptyResult: (context: string, guidance: string) => string;
