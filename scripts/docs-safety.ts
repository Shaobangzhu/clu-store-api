import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { syntheticRegistration } from '../src/contracts/api.js';

export interface SensitiveEvidence { blocked: Set<string>; legacyRoutes: Set<string>; sha256: string; requestCount: number }
const jwtPattern = /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
function tokenLike(value: string) {
  return [...value.matchAll(jwtPattern)].some(([token]) => {
    try {
      const header: unknown = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8'));
      return header !== null && typeof header === 'object';
    } catch { return token.startsWith('eyJ'); }
  });
}
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}
function normalizePath(path: string) {
  return path.replace(/\/products\/\d+$/, '/products/{id}').replace(/\/categories\/[^/]+$/, '/categories/{title}')
    .replace(/\/items\/\d+$/, '/items/{id}').replace(/\/orders\/\d+(?=\/|$)/, '/orders/{id}').replace(/:([A-Za-z]+)/g, '{$1}');
}
export function inspectSensitiveOriginal(path: string): SensitiveEvidence {
  // The source is data only. Never copy content, descriptions, headers or body values.
  const raw = readFileSync(path, 'utf8');
  let source: unknown;
  try { source = JSON.parse(raw); } catch { throw new Error('Sensitive original is invalid JSON (values suppressed)'); }
  const blocked = new Set<string>();
  const legacyRoutes = new Set<string>();
  let requestCount = 0;
  function credentials(value: unknown) {
    if (Array.isArray(value)) { value.forEach(credentials); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (/password|authorization|access.?token/i.test(key) && typeof child === 'string' && child.length >= 6) blocked.add(child);
      if (key === 'key' && typeof child === 'string' && /password|authorization|token/i.test(child)) {
        const content = (value as Record<string, unknown>).value;
        if (typeof content === 'string' && content.length >= 6) { blocked.add(content); blocked.add(content.replace(/^Bearer\s+/i, '')); }
      }
      if (key === 'raw' && typeof child === 'string') { try { credentials(JSON.parse(child)); } catch { /* Untrusted text is never executed. */ } }
      credentials(child);
    }
  }
  function visit(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const node = value as Record<string, unknown>;
    if (Array.isArray(node.item)) node.item.forEach(visit);
    if (!node.request || typeof node.request !== 'object') return;
    requestCount += 1;
    const req = node.request as Record<string, unknown>;
    const url = typeof req.url === 'string' ? req.url : (req.url as { raw?: string } | undefined)?.raw;
    if (url) {
      let parsed: URL;
      try { parsed = new URL(url); } catch { throw new Error('Sensitive original URL cannot be normalized (values suppressed)'); }
      blocked.add(parsed.origin); blocked.add(parsed.hostname);
      legacyRoutes.add(`${String(req.method).toLowerCase()} ${normalizePath(parsed.pathname)}`);
    }
    credentials(req);
    for (const text of strings(req)) {
      for (const match of text.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
        try { const parsed = new URL(match[0]); blocked.add(parsed.origin); blocked.add(parsed.hostname); } catch { /* Ignore malformed source URLs. */ }
      }
      for (const [token] of text.matchAll(jwtPattern)) if (tokenLike(token)) blocked.add(token);
    }
  }
  visit(source);
  return { blocked, legacyRoutes, sha256: createHash('sha256').update(raw).digest('hex'), requestCount };
}
export function privateEnvironmentValues(path = '.env'): string[] {
  if (!existsSync(path)) return [];
  return Object.entries(parseEnv(readFileSync(path, 'utf8')))
    .flatMap(([key, value]) => /PASSWORD|SECRET|DATABASE_URL/.test(key) && typeof value === 'string' && value.length >= 16 ? [value] : []);
}
export function assertArtifactSafe(artifact: unknown, blocked: Iterable<string> = []) {
  const denied = [...blocked].filter((value) => value.length >= 6);
  const allowedOrigins = new Set(['http://localhost:3000', 'https://schema.getpostman.com', 'https://schema.postman.com', 'http://json-schema.org', 'https://json-schema.org']);
  const textValues = strings(artifact);
  for (const text of textValues) {
    if (denied.some((value) => text.includes(value)) || tokenLike(text)) throw new Error('Generated artifact failed sensitive-value/token scan (values suppressed)');
    for (const match of text.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
      let url: URL;
      try { url = new URL(match[0]); } catch { throw new Error('Invalid artifact URL (value suppressed)'); }
      if (!allowedOrigins.has(url.origin) || url.username || url.password) throw new Error('Unapproved artifact origin/URL credentials (value suppressed)');
    }
    if (/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/.test(text)) throw new Error('Embedded IPv4 address in generated artifact (value suppressed)');
    if (/curl\s|--location\s|--header\s/i.test(text)) throw new Error('Unexpected cURL material in generated artifact');
  }
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.type === 'bearer') {
      const bearer = node.bearer as { key?: string; value?: string }[] | undefined;
      if (!Array.isArray(bearer) || bearer.length !== 1 || bearer[0]?.key !== 'token' || bearer[0].value !== '{{accessToken}}') throw new Error('Unsafe bearer auth definition');
    }
    if (typeof node.key === 'string' && /^authorization$/i.test(node.key)) throw new Error('Authorization header must not be embedded; use bearer variables');
    for (const [key, child] of Object.entries(node)) {
      if (/^authorization$/i.test(key) && typeof child === 'string') throw new Error('Unexpected hardcoded Authorization value');
      if (/^(?:password|confirmPassword|ConfirmPassword)$/i.test(key) && typeof child === 'string'
        && child !== syntheticRegistration.password && !/^\{\{[A-Za-z]+\}\}$/.test(child)) throw new Error('Non-synthetic credential example (value suppressed)');
      if (key === 'raw' && typeof child === 'string') { try { visit(JSON.parse(child)); } catch (error) { if (!(error instanceof SyntaxError)) throw error; } }
      visit(child);
    }
  }
  visit(artifact);
}
