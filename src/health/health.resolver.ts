import { Query, Resolver } from '@nestjs/graphql';
import { HealthService } from './health.service';
import { HealthStatus } from './models/health-status.model';

@Resolver()
export class HealthResolver {
  constructor(private readonly healthService: HealthService) {}

  @Query(() => HealthStatus)
  health(): Promise<HealthStatus> {
    return this.healthService.getHealthStatus();
  }
}
