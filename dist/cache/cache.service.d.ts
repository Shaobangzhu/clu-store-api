import Redis from 'ioredis';
export declare class CacheService {
    private readonly redisClient;
    constructor(redisClient: Redis);
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    reset(): Promise<void>;
    ping(): Promise<string>;
}
