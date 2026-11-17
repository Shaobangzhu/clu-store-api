import type { Client } from 'pg';
import { expect, it, vi } from 'vitest';
import { assertTestConnection } from '../scripts/test-database-guard.js';

const safe = { database: 'clu_store_test', role: 'clu_test', rolsuper: false,
  rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false };
it('rejects unsafe actual identities before inspecting database privileges', async () => {
  for (const patch of [{ database: 'clu_store_dev' }, { role: 'clu_dev' },
    { rolsuper: true }, { rolcreatedb: true }, { rolcreaterole: true },
    { rolreplication: true }, { rolbypassrls: true }]) {
    const query = vi.fn().mockResolvedValue({ rows: [{ ...safe, ...patch }] });
    await expect(assertTestConnection({ query } as unknown as Client)).rejects.toThrow('actual database/role is unsafe');
    expect(query).toHaveBeenCalledTimes(1);
  }
});
it('requires denial of access to every other non-template database', async () => {
  for (const rows of [[], [{ name: 'clu_store_dev' }], [{ name: 'production' }]]) {
    const query = vi.fn().mockResolvedValueOnce({ rows: [safe] }).mockResolvedValueOnce({ rows });
    const result = assertTestConnection({ query } as unknown as Client);
    if (rows.length) await expect(result).rejects.toThrow('test role can connect to another database');
    else await expect(result).resolves.toBeUndefined();
  }
});
