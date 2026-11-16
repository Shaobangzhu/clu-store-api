// B3 exact-target safeguard. Importing this module never connects to a database.
export const targets = [{"database": "clu_store_dev", "role": "clu_dev", "port": "55438"}] as const;
export type MigrationTarget = (typeof targets)[number];
export const migrationSchema = 'public';

export function migrationTarget(value: string | undefined): MigrationTarget {
  try {
    const url = new URL(value ?? '');
    const target = targets.find((candidate) =>
      url.port === candidate.port &&
      decodeURIComponent(url.username) === candidate.role &&
      decodeURIComponent(url.pathname.slice(1)) === candidate.database);
    if (!target || !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      !url.password || url.search || url.hash) throw new Error();
    return target;
  } catch {
    throw new Error('Migration target refused; require the reviewed B3 loopback port, database and application role without URL options.');
  }
}

export interface MigrationIdentity {
  database: string;
  role: string;
  database_owner: string;
  schema_owner: string;
  version: number;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
  can_use: boolean;
  can_create: boolean;
  marker: string | null;
}

// Execute only inside a READ ONLY transaction during separately authorized B3.3.
export const identitySql = `
  SELECT current_database()::text AS database, current_user::text AS role,
    pg_get_userbyid(d.datdba)::text AS database_owner,
    pg_get_userbyid(n.nspowner)::text AS schema_owner,
    current_setting('server_version_num')::int AS version,
    r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
    has_schema_privilege(current_user, n.oid, 'USAGE') AS can_use,
    has_schema_privilege(current_user, n.oid, 'CREATE') AS can_create,
    obj_description(n.oid, 'pg_namespace') AS marker
  FROM pg_database d, pg_roles r, pg_namespace n
  WHERE d.datname = current_database() AND r.rolname = current_user
    AND n.nspname = $1
`;

export function assertMigrationIdentity(row: MigrationIdentity | undefined, target: MigrationTarget): void {
  if (!row || row.database !== target.database || row.role !== target.role ||
    row.database_owner !== target.role || row.schema_owner !== target.role ||
    !Number.isInteger(row.version) || row.version < 180000 || row.version >= 190000 ||
    row.rolsuper !== false || row.rolcreatedb !== false || row.rolcreaterole !== false ||
    row.rolreplication !== false || row.rolbypassrls !== false ||
    row.can_use !== true || row.can_create !== true) {
    throw new Error('Migration preflight refused: actual database, restricted role, PostgreSQL major, schema ownership or privileges differ from B3.');
  }
}
