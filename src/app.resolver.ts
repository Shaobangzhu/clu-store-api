import { Query, Resolver } from '@nestjs/graphql';
import { CacheService } from './cache/cache.service';

@Resolver()
export class AppResolver {
  constructor(private readonly cacheService: CacheService) {}

  @Query(() => String)
  hello(): string {
    return 'GraphQL is ready';
  }

  @Query(() => String)
  async cachePing(): Promise<string> {
    return this.cacheService.ping();
  }
}
