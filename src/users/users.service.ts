import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument, UserEntity } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  findById(id: string): Promise<UserEntity | null> {
    return this.userModel.findById(id).exec();
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.userModel
      .findOne({ email: UsersService.normalizeEmail(email) })
      .exec();
  }

  findByEmailWithPassword(email: string): Promise<UserEntity | null> {
    return this.userModel
      .findOne({ email: UsersService.normalizeEmail(email) })
      .select('+passwordHash')
      .exec();
  }

  private static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
