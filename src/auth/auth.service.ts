import { Injectable } from '@nestjs/common';
import { UserEntity } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  validateJwtPayload(payload: JwtPayload): Promise<UserEntity | null> {
    return this.usersService.findById(payload.sub);
  }
}
