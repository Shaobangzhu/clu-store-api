import { CacheService } from './cache/cache.service';
export declare class AppResolver {
    private readonly cacheService;
    constructor(cacheService: CacheService);
    hello(): string;
    cachePing(): Promise<string>;
}
