import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
import { UserRole } from './user-role.enum';

@ObjectType()
export class User {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;

  @Field(() => [UserRole])
  roles!: UserRole[];

  @Field()
  isEmailVerified!: boolean;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}
