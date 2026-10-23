import { readFileSync } from 'node:fs';
import express, { type Express } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import type { ApiSpec } from '../src/documentation/openapi.js';

// Inspect actual Express registrations, independent of operations/operationPaths.
// Express 5 stores mount matchers as closures: capture the public use() argument
// while allowing the original method to register every real handler unchanged.
interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: Layer[] };
}
function stack(app: Express): Layer[] { return (app.router as unknown as { stack: Layer[] }).stack; }
function registeredApp() {
  const mounts = new WeakMap<Layer, string>();
  const original = express.application.use;
  const spy = vi.spyOn(express.application, 'use').mockImplementation(function (this: Express, ...args: unknown[]) {
    const before = stack(this).length;
    const result = original.apply(this, args as Parameters<typeof original>);
    const mount = typeof args[0] === 'string' ? args[0] : '/';
    for (const layer of stack(this).slice(before)) {
      if (layer.handle.stack && Array.isArray(args[0])) throw new Error('Extend mount inspection for array mounts');
      mounts.set(layer, mount);
    }
    return result;
  } as typeof original);
  try {
    return { app: createApp(parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' })), mounts };
  } finally { spy.mockRestore(); }
}
function inventory(app: Express, mounts: WeakMap<Layer, string>) {
  const found: string[] = [];
  function visit(layers: Layer[], prefix: string, root: boolean) {
    for (const layer of layers) {
      if (layer.route) {
        if (typeof layer.route.path !== 'string') throw new Error('Extend route inspection for non-string paths');
        const path = `${prefix}/${layer.route.path}`.replace(/\/{2,}/g, '/').replace(/\/$/, '')
          .replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}');
        for (const [method, enabled] of Object.entries(layer.route.methods)) {
          if (enabled) found.push(`${method} ${path || '/'}`);
        }
      } else if (layer.handle.stack) {
        if (!root || !mounts.has(layer)) throw new Error('Uninspected router mount; extend the contract test');
        visit(layer.handle.stack, mounts.get(layer)!, false);
      }
    }
  }
  visit(stack(app), '', true);
  return found.sort();
}
const spec = JSON.parse(readFileSync('docs/openapi.json', 'utf8')) as ApiSpec;
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const documented = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.keys(item).filter((method) => methods.has(method)).map((method) => `${method} ${path}`));
// Explicit UI implementation assets; never exempt a whole path prefix.
const assets = ['get /docs/assets/init.js', 'get /docs/assets/swagger-ui.css', 'get /docs/assets/swagger-ui-bundle.js'];
const expected = [...documented, ...assets].sort();

describe('OpenAPI versus mounted Express routes', () => {
  it('matches every actual method/path, including both case-accurate cart mounts, without duplicates', () => {
    const { app, mounts } = registeredApp();
    const actual = inventory(app, mounts);
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
    expect(documented).toHaveLength(30);
  });
  it('detects removal of the legacy router mount even when its catalog definitions remain', () => {
    const { app, mounts } = registeredApp();
    const layers = stack(app);
    const index = layers.findIndex((layer) => mounts.get(layer) === '/api/ShoppingCart');
    expect(index).toBeGreaterThanOrEqual(0);
    layers.splice(index, 1);
    const actual = inventory(app, mounts);
    expect(expected.filter((entry) => !actual.includes(entry))).toHaveLength(5);
  });
  it('detects undocumented routes and incorrect method registrations', () => {
    const { app, mounts } = registeredApp();
    app.post('/health', (_req, res) => res.sendStatus(204));
    expect(inventory(app, mounts).filter((entry) => !expected.includes(entry))).toEqual(['post /health']);
  });
});
