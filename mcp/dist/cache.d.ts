interface Cache {
    get: <T = unknown>(key: string) => T | undefined;
    set: <T = unknown>(key: string, value: T, ttlMs: number) => void;
    readonly size: number;
}
export declare const createCache: (maxSize?: number) => Cache;
export {};
