import { Connection } from 'mongoose';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const createService = (
    readyState: number,
    pingImplementation: jest.Mock,
  ): HealthService => {
    const mockMongoConnection = {
      readyState,
    } as Connection;

    const mockRedisClient = {
      ping: pingImplementation,
    };

    return new HealthService(mockMongoConnection, mockRedisClient as never);
  };

  it('returns ok when mongo and redis are healthy', async () => {
    const service = createService(1, jest.fn().mockResolvedValue('PONG'));

    const result = await service.getHealthStatus();

    expect(result.status).toBe('ok');
    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        { name: 'application', isHealthy: true },
        { name: 'mongo', isHealthy: true },
        { name: 'redis', isHealthy: true },
      ]),
    );
  });

  it('returns degraded when redis is unavailable', async () => {
    const service = createService(
      1,
      jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    );

    const result = await service.getHealthStatus();

    expect(result.status).toBe('degraded');
    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        { name: 'application', isHealthy: true },
        { name: 'mongo', isHealthy: true },
        { name: 'redis', isHealthy: false },
      ]),
    );
  });

  it('returns degraded when mongo is not connected', async () => {
    const service = createService(0, jest.fn().mockResolvedValue('PONG'));

    const result = await service.getHealthStatus();

    expect(result.status).toBe('degraded');
    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        { name: 'application', isHealthy: true },
        { name: 'mongo', isHealthy: false },
        { name: 'redis', isHealthy: true },
      ]),
    );
  });
});
