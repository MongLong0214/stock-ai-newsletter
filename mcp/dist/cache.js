export const createCache = (maxSize = 50) => {
    const store = new Map();
    const evictExpired = () => {
        const now = Date.now();
        for (const [key, entry] of store) {
            if (entry.expiresAt <= now) {
                store.delete(key);
            }
        }
    };
    return {
        get(key) {
            const entry = store.get(key);
            if (!entry)
                return undefined;
            if (entry.expiresAt <= Date.now()) {
                store.delete(key);
                return undefined;
            }
            return entry.value;
        },
        set(key, value, ttlMs) {
            if (store.size >= maxSize) {
                evictExpired();
            }
            if (store.size >= maxSize) {
                const oldest = store.keys().next().value;
                store.delete(oldest);
            }
            store.set(key, { value, expiresAt: Date.now() + ttlMs });
        },
        get size() {
            return store.size;
        },
    };
};
