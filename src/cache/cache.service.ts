import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './cache.constants';

@Injectable()
export class CacheService {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redisClient.get(key);

    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serializedValue = JSON.stringify(value);

    if (ttlSeconds) {
      await this.redisClient.set(key, serializedValue, 'EX', ttlSeconds);
      return;
    }

    await this.redisClient.set(key, serializedValue);
  }

  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  async reset(): Promise<void> {
    await this.redisClient.flushdb();
  }

  async ping(): Promise<string> {
    return this.redisClient.ping();
  }
}
