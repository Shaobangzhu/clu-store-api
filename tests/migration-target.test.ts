import { describe, expect, it } from 'vitest';
import { migrationTarget, assertMigrationIdentity, targets, type MigrationIdentity } from '../scripts/migration-target.js';

const canary = 'synthetic-private-canary';
const urlFor = (target: (typeof targets)[number]) =>
  `postgresql://${target.role}:${canary}@127.0.0.1:${target.port}/${target.database}`;

describe('B3 migration target safeguards (DB-free)', () => {
  it('accepts only the exact reviewed targets', () => {
    for (const target of targets) expect(migrationTarget(urlFor(target))).toEqual(target);
  });
  it('rejects alternate endpoints, identities and URL options without disclosing input', () => {
    const url = urlFor(targets[0]);
    for (const value of [undefined, canary, url.replace('127.0.0.1', 'postgres'),
      url.replace('127.0.0.1', 'example.com'), url.replace(targets[0].port, '5433'),
      url.replace(targets[0].role + ':', 'bootstrap:'),
      url.replace('/' + targets[0].database, '/unrelated'),
      url.replace('postgresql:', 'https:'), url.replace(canary, ''),
      url + '?schema=public', url + '#fragment']) {
      expect(() => migrationTarget(value)).toThrow('Migration target refused');
      try { migrationTarget(value); } catch (error) { expect(String(error)).not.toContain(canary); }
    }
  });
  it('checks actual identity, ownership, privileges and major before any migration', () => {
    for (const target of targets) {
      const row: MigrationIdentity = {
        database: target.database, role: target.role, database_owner: target.role,
        schema_owner: target.role, version: 180000, rolsuper: false,
        rolcreatedb: false, rolcreaterole: false, rolreplication: false,
        rolbypassrls: false, can_use: true, can_create: true, marker: null,
      };
      expect(() => assertMigrationIdentity(row, target)).not.toThrow();
      expect(() => assertMigrationIdentity(undefined, target)).toThrow('Migration preflight refused');
      for (const patch of [
        { database: 'unrelated' }, { role: 'bootstrap' }, { database_owner: 'bootstrap' },
        { schema_owner: 'bootstrap' }, { version: 170000 }, { version: 190000 },
        { rolsuper: true }, { rolcreatedb: true }, { rolcreaterole: true },
        { rolreplication: true }, { rolbypassrls: true }, { can_use: false }, { can_create: false },
      ]) expect(() => assertMigrationIdentity({ ...row, ...patch }, target)).toThrow('Migration preflight refused');
    }
  });
});
