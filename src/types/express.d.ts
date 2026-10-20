import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Locals {
    requestId: string;
    success: (data: unknown, status?: number, meta?: unknown) => void;
  }
}
