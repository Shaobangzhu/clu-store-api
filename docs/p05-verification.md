# P05 authentication verification

Verified locally on 2026-10-21. Initial working tree was clean on `main`, with P04 committed at `276571e`. README, current source/configuration, schema/migration, architecture/API/data/local-development docs and the implementation roadmap were inspected. No applicable AGENTS.md was present in the repository or ancestor directories. Existing source was extended; the database schema, seed, catalog fixtures and private `.env` were preserved.

## Implemented behavior

- Register/login routes with strict Zod bodies, required email, normalized identities and deprecated compatibility aliases. Registration returns a safe USER projection; login returns a safe user and access-token metadata.
- Argon2id (64 MiB, three passes, one lane), randomized salts, a randomly initialized dummy hash for absent-user verification, and a four-operation process concurrency cap.
- JOSE HS256 with a 256-bit environment key, required issuer/audience/UUID subject/timestamps, finite bounded expiration and algorithm/type allowlists. No role or credential claims.
- `requireAuth` re-fetches the safe user and role from PostgreSQL. `requireRole('ADMIN')` denies a normal user and observes role changes on the next request. Only test harnesses expose guard probe routes.
- Shared per-IP auth limits before body parsing, additional HMACed normalized-identifier limits, no-store auth responses, generic credential failures, and explicit safe response projections/log redaction.
- Explicit create-only admin CLI with operator credentials on stdin and configured/actual database-name confirmation. No fixed account, seed credentials or public admin provisioning route.

No new migration was necessary: the original PostgreSQL migration already includes `User_username_normalized_key` and `User_email_normalized_key` on lower/trimmed identities. The repository catches database uniqueness violations, including concurrent inserts, and performs parameterized lookups with the same normalization expressions.

## Commands and actual results

| Command | Exit/result |
|---|---|
| `git status --short` | 0; initially empty |
| `git branch --show-current` | 0; `main` |
| `git log -5 --oneline` | 0; P04 at HEAD |
| `docker ps --format '{{.Names}} {{.Ports}} {{.Status}}'` | Sandbox initially denied socket access; authorized retry exit 0: existing `clu-store-api-local-postgres-1` healthy, `127.0.0.1:5433->5432` |
| `docker compose ls` | 0; reused existing `clu-store-api-local` project |
| `node --version`; `npm --version` | 0; v24.19.0 / 11.17.0 |
| `npm install --save-exact argon2 jose` | 0; pinned argon2 0.45.1 and jose 6.2.13; audit reported zero vulnerabilities |
| `npm ls argon2 jose` | 0; confirmed pinned versions |
| Native Argon2id hash import/probe | 0; installed native addon loaded successfully |
| `npm run db:migrate:test` | 0; guarded test database, one migration present, no pending migrations, no reset |
| `npm run test:integration -- tests/integration/auth.test.ts` (first run) | 1; 43 passed, one test incorrectly assumed the ordering of Argon2 PHC parameters. Fixed the assertion to compare named parameters independent of order. |
| `npm test` (first run in restricted sandbox) | 1; 21 Supertest cases could not bind localhost (`listen EPERM`); 30 passed. Reran with authorized socket access. |
| `npm run test:integration -- tests/integration/auth.test.ts tests/integration/public-reads.test.ts` (final) | 0; **83 passed**, two files, 4.74 s |
| `npm test` (final) | 0; **51 passed**, four files, 283 ms |
| `npm run lint` (final) | 0 |
| `npm run typecheck` (final) | 0; application plus tests/scripts/config |
| `npm run build` (final) | 0 |
| `git diff --check` | 0 |

The final integration command includes the 44 auth tests and the 39 existing public-read tests because P05 changes shared app middleware. Native dependencies were usable without changing npm's pending lifecycle-script approval settings. Intermediate typechecks also passed. The final test/build checks preceded documentation-only updates.

The admin CLI subprocess is exercised against `clu_store_test`: wrong database confirmation exits 1 without creating a user; a new explicitly supplied account exits 0 with ADMIN; duplicate provisioning exits 1 with `ACCOUNT_CONFLICT`. All generated account/password/signing inputs are ephemeral. The development database was never mutated by P05 verification.

## Test isolation and coverage

Before mutation, the suite validates both URLs, exact local test database/role, actual current database/user and safe PostgreSQL role privileges. Auth tests use unique run-owned identities, so concurrent registrations exercise actual committed database uniqueness. The finalizer deletes only exact usernames allocated by the run and asserts that the initial user count is restored. No table reset/truncation or broad prefix deletion occurs. The original public-read rollback/count assertions also passed.

Auth coverage includes canonical registration, case/space normalization, username/email duplicates and races, no-email rejection, invalid email/confirmation, weak/long passwords, password-space preservation, rejected role injection, legacy alias metadata, login by username/email, indistinguishable bad-credential errors, token metadata, malformed/expired/wrong-signature/wrong-issuer/wrong-audience/wrong-algorithm tokens, absent/invalid subjects, future issuance, missing expiration, excessive TTL, signed role-claim forgery, role promotion/demotion/deletion, strict rate limiting, and CLI provisioning. Security regressions verify secret validation, disabled-auth behavior, malformed-JSON accounting, raw-error/log redaction and bounded password concurrency. Responses never include `passwordHash` or an encoded Argon2 hash.

## Design limits and P06 handoff

The exact contract and residual risks are in [api-contract.md](api-contract.md#p05-authentication). P05 deliberately uses a single-service HS256 access token with a 15-minute default lifetime, no refresh/revocation/logout system, and current-role database reads per protected request. Signing-key changes invalidate existing tokens; out-of-band password changes do not. Roles can change during an already-authorized request. Per-process memory limiters reset on restart and need a shared-store/proxy policy before multi-process deployment. The signup conflict still reveals that some identity is unavailable. The small local password denylist is not a comprehensive breached-password check. Email verification and MFA are not implemented.

The existing private `.env` has **no JWT_SECRET** and was intentionally preserved. Set a cryptographically generated key before using local auth. Development auth remains unavailable with 503 until configured; production refuses a missing key. Fresh `env:local` files generate it. This is a configuration prerequisite, not a test skip: all JWT tests used freshly generated keys and the real test database. No development administrator was created.

P06 can use `requireAuth(service)` and derive the cart owner exclusively from `res.locals.user.id`. It must validate product/model/memory/color ownership and availability from PostgreSQL, compute Decimal full-model base plus memory increment, enforce complete-SKU merge uniqueness and quantity caps, and test cross-user isolation. The existing schema supplies those relations; no cart/order/auth-client integration is claimed by P05.

## Files changed

- New: `src/modules/auth/{schemas,repository,password,token,service,routes}.ts`, `src/middleware/auth.ts`, `scripts/create-admin.ts`.
- Application/config: `src/app.ts`, `src/server.ts`, `src/config/env.ts`, `src/lib/errors.ts`, `src/lib/logger.ts`, `src/middleware/error-handler.ts`, `src/types/express.d.ts`.
- Tooling: `.env.example`, `scripts/setup-local-env.ts`, `package.json`, `package-lock.json`.
- Tests: `tests/integration/auth.test.ts`, `tests/auth-security.test.ts`.
- Documentation: `README.md`, `docs/api-contract.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/local-development.md`, this verification record.

No commit, push, pull request or deployment was performed.

References used to check implementation choices: [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [node-argon2 maintained source](https://github.com/ranisalt/node-argon2), and [JOSE maintained source](https://github.com/panva/jose). Concrete parameters and limits above are this repository's documented V1 policy.
