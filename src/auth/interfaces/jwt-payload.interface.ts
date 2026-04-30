import { UserRole } from '../../users/models/user-role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: UserRole[];
}
