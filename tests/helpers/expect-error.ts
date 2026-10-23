import { expect } from 'vitest';
import type { Response } from 'supertest';

export function expectError(response: Response, status: number, code: string, message: string, details: unknown = null) {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toContain('application/json');
  expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  expect(response.body).toEqual({ success: false, error: { code, message, details } });
  expect(response.text).not.toMatch(/passwordHash|\$argon2|Prisma|stack|p07_fault|p08_fault/);
}
