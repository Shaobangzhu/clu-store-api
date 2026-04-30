import { registerEnumType } from '@nestjs/graphql';

export enum UserRole {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
}

registerEnumType(UserRole, {
  name: 'UserRole',
});
