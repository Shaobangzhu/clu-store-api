import { z } from 'zod';

// ASCII identities avoid Unicode/collation ambiguity. Passwords are never normalized.
export const normalizeIdentity = (value: string) => value.trim().toLowerCase();
export const usernameSchema = z.string().max(100).transform(normalizeIdentity)
  .pipe(z.string().min(3).max(32).regex(/^[a-z0-9][a-z0-9._-]*$/));
export const emailSchema = z.string().max(300).transform(normalizeIdentity)
  .pipe(z.email().max(254).regex(/^[\x21-\x7e]+$/));
const commonPasswords = new Set(['password123456789', '123456789012345', '1234567890123456', 'qwertyuiopasdfgh', 'correct horse battery staple']);
export const passwordSchema = z.string().min(15).max(128).refine((value) =>
  value.trim().length >= 15 && !/^(.)\1+$/su.test(value) && !commonPasswords.has(value.toLowerCase()),
  'Use a long, uncommon password',
);
const confirmation = z.string().max(128);
export const registerBody = z.object({
  username: usernameSchema, email: emailSchema, password: passwordSchema,
  confirmPassword: confirmation.optional(), ConfirmPassword: confirmation.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.confirmPassword === undefined && value.ConfirmPassword === undefined
    || value.confirmPassword !== undefined && value.ConfirmPassword !== undefined
    || (value.confirmPassword ?? value.ConfirmPassword) !== value.password) {
    ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Provide exactly one matching confirmation' });
  }
}).transform((value) => ({ username: value.username, email: value.email, password: value.password,
  deprecatedConfirmation: value.ConfirmPassword !== undefined }));
const identifier = z.string().max(300).transform(normalizeIdentity)
  .pipe(z.string().min(1).max(254).regex(/^[\x21-\x7e]+$/));
export const loginBody = z.object({
  identifier: identifier.optional(), username: identifier.optional(), password: z.string().min(1).max(128),
}).strict().superRefine((value, ctx) => {
  if ((value.identifier === undefined) === (value.username === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['identifier'], message: 'Provide exactly one identifier' });
  }
}).transform((value) => ({ identifier: (value.identifier ?? value.username)!, password: value.password,
  deprecatedUsername: value.username !== undefined }));
export const registerRequest = z.object({ query: z.object({}).strict(), body: registerBody });
export const loginRequest = z.object({ query: z.object({}).strict(), body: loginBody });
export type Registration = z.output<typeof registerBody>;
export type Login = z.output<typeof loginBody>;
