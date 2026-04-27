import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class DependencyHealth {
  @Field()
  name!: string;

  @Field()
  isHealthy!: boolean;
}

@ObjectType()
export class HealthStatus {
  @Field()
  status!: string;

  @Field(() => [DependencyHealth])
  dependencies!: DependencyHealth[];
}
