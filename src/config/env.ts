import { z } from 'zod';

const integer = (fallback: number, max: number) =>
  z.coerce.number().int().positive().max(max).default(fallback);
const origin = z.string().url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
}, 'Must be an exact HTTP(S) origin without a path or trailing slash');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: integer(3000, 65535),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string().default('').transform((value) =>
    value.split(',').map((entry) => entry.trim()).filter(Boolean),
  ).pipe(z.array(origin)),
  JSON_BODY_LIMIT_BYTES: integer(102400, 1048576),
  RATE_LIMIT_WINDOW_MS: integer(60000, 3600000),
  RATE_LIMIT_MAX: integer(100, 100000),
  DATABASE_URL: z.string().url().refine((value) =>
    value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'Must be a PostgreSQL connection URL',
  ).optional(),
  DB_CHECK_TIMEOUT_MS: integer(2000, 10000),
  SHUTDOWN_TIMEOUT_MS: integer(10000, 60000),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(input: NodeJS.ProcessEnv): Env {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    // Names only: never echo environment values into startup output.
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  return parsed.data;
}
