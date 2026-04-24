import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class AppResolver {
  @Query(() => String)
  hello(): string {
    return 'GraphQL is ready';
  }
}
