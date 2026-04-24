import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  mongoUri: process.env.MONGO_URI as string,
}));
