import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../cache/cache.constants';
import { DependencyHealth, HealthStatus } from './models/health-status.model';

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection()
    private readonly mongoConnection: Connection,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
  ) {}

  async getHealthStatus(): Promise<HealthStatus> {
    const mongoHealth = this.checkMongo();
    const redisHealth = await this.checkRedis();

    const dependencies: DependencyHealth[] = [
      {
        name: 'application',
        isHealthy: true,
      },
      mongoHealth,
      redisHealth,
    ];

    const status = dependencies.every((dependency) => dependency.isHealthy)
      ? 'ok'
      : 'degraded';

    return {
      status,
      dependencies,
    };
  }

  private checkMongo(): DependencyHealth {
    const readyState = this.mongoConnection.readyState;
    const isHealthy = [1].includes(readyState);

    return {
      name: 'mongo',
      isHealthy,
    };
  }

  private async checkRedis(): Promise<DependencyHealth> {
    try {
      const response = await this.redisClient.ping();

      return {
        name: 'redis',
        isHealthy: response === 'PONG',
      };
    } catch {
      return {
        name: 'redis',
        isHealthy: false,
      };
    }
  }
}
