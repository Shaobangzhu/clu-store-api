import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../models/user-role.enum';

export type UserDocument = HydratedDocument<UserEntity>;

@Schema({
  collection: 'users',
  timestamps: true,
})
export class UserEntity {
  @Prop({
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
  })
  email!: string;

  @Prop({
    required: true,
    select: false,
  })
  passwordHash!: string;

  @Prop({
    trim: true,
  })
  firstName?: string;

  @Prop({
    trim: true,
  })
  lastName?: string;

  @Prop({
    type: [String],
    enum: Object.values(UserRole),
    default: [UserRole.CUSTOMER],
  })
  roles!: UserRole[];

  @Prop({
    default: false,
  })
  isEmailVerified!: boolean;

  createdAt!: Date;

  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);
