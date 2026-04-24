import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST as string,
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
}));
