import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

export const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Authentication failed');
export function createTokens(config: Env) {
  if (!config.JWT_SECRET) throw new Error('JWT_SECRET is required for authentication');
  const key = Buffer.from(config.JWT_SECRET, 'hex');
  return {
    async issue(subject: string) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = issuedAt + config.JWT_TTL_SECONDS;
      const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(z.uuid().parse(subject)).setIssuer(config.JWT_ISSUER).setAudience(config.JWT_AUDIENCE)
        .setIssuedAt(issuedAt).setExpirationTime(expiresAt).setJti(randomUUID()).sign(key);
      return { token, tokenType: 'Bearer' as const, expiresIn: config.JWT_TTL_SECONDS,
        expiresAt: new Date(expiresAt * 1000).toISOString() };
    },
    async verify(token: string) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'], typ: 'JWT', issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE,
          requiredClaims: ['sub', 'iss', 'aud', 'iat', 'exp'], maxTokenAge: config.JWT_TTL_SECONDS,
          clockTolerance: 0,
        });
        if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
          || payload.exp! <= payload.iat! || payload.exp! - payload.iat! > config.JWT_TTL_SECONDS) throw unauthorized();
        return z.uuid().parse(payload.sub);
      } catch { throw unauthorized(); }
    },
  };
}
