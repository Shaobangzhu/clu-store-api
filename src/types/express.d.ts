import 'express-serve-static-core';
import type { SafeUser } from '../modules/auth/repository.js';

declare module 'express-serve-static-core' {
  interface Locals {
    requestId: string;
    user?: SafeUser;
    success: (data: unknown, status?: number, meta?: unknown) => void;
  }
}
