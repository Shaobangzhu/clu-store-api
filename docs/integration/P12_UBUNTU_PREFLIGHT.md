# P12.0 — Ubuntu Integration Preflight

Inspection date: 2026-11-16 UTC. Scope: read-only repository, runtime configuration,
host listener and PostgreSQL metadata inspection. This is a point-in-time baseline,
not a completed browser integration test. Only this sanitized report was created.
No infrastructure, service, database content, client file or Git state was changed.
Connection credentials were consumed privately for metadata queries; credential
values, connection URLs, tokens and environment file contents are not reproduced.

## A. Git revisions

| Repository | Branch | HEAD | Initial working tree |
| --- | --- | --- | --- |
| `/home/clu/projects/clu-store-api` | `docs/p12-ubuntu-preflight` | `374377f1dbefbe80a2d529652cc694b57a76cc77` | Clean |
| `/home/clu/projects/clu-store-client` | `main` | `84b4a156178773f4189c2becf3e392e572af15c2` | Clean |

API HEAD: `fix(ci): use Prisma CLI for ephemeral Compose migrations`,
2026-11-16T18:50:34Z. Client HEAD: `chore(client): establish local API integration foundation`,
2026-11-16T21:54:53Z. The earlier dirty-client stop condition is resolved at this
inspection. The client branch is recorded as evidence; the expected branch rule
applies to the working API repository. No Git write operations were performed.

## B. Actual port mapping

| Component | Configured host endpoint | Actual observation |
| --- | --- | --- |
| Host API | `127.0.0.1:3008` | No listener; HTTP probes refused |
| Vite development server | `127.0.0.1:5178`, strict port | No listener |
| Central CLU PostgreSQL | `127.0.0.1:55438` → container `5432` | Listener and authenticated metadata queries succeeded |
| Independent API Compose API | Default `127.0.0.1:3000` → `3000` | No host listener observed |
| Independent API Compose PostgreSQL | Default `127.0.0.1:5433` → `5432` | No host listener observed |

Evidence: host `ss -ltnp` outside the sandbox; selected nonsecret settings from
the API `.env` and `/home/clu/infra/runtime/clu-store-api/server.env`; client
`vite.config.js`; central and repository `compose.yaml` files. API source defaults
to port 3000, but both inspected host environment files select 3008. Vite proxies
`/api` to `http://127.0.0.1:3008`. The private client runtime file exists; no client
repository `.env*` file was present. Its values were not needed for this conclusion.

Read-only probes outside the network sandbox:

| Request | Result |
| --- | --- |
| `GET http://127.0.0.1:3008/health` | curl exit 7; connection refused; HTTP 000 (no HTTP response) |
| `GET http://127.0.0.1:3008/ready` | curl exit 7; connection refused; HTTP 000 (no HTTP response) |

Initial sandbox socket errors were retried outside the sandbox; they are not
treated as application failures. No service was started to obtain a passing probe.

## C. Infrastructure topology

Central infrastructure is Compose project `infra021011` in
`/home/clu/infra/postgres/infra021011`. Its `clu-db` service uses pinned PostgreSQL
18 Bookworm on linux/amd64, bridge network `infra021011_clu_db`, and named volume
`infra021011_clu_pg18_data` mounted at `/var/lib/postgresql`. Host access is loopback
port 55438. Secret files are mounted through the infrastructure entrypoint; their
contents were not inspected. Other application database services have separate
networks/volumes and loopback ports 55435–55437.

Host API → loopback 55438 → central CLU instance → separate development/test databases.
Browser → forwarded Vite 5178 → server-side `/api` proxy → loopback API 3008.

The API repository also contains an **independent** Compose project,
`clu-store-api-local`, with `api`, profiled `migrate`, and `postgres` services,
a separate `postgres_data` volume, and development/test provisioning. Its default
database endpoint is 5433, not central 55438. Starting it would create/use a second
database topology; do not treat its state as evidence for the central database.
No Compose command that starts, recreates or tears down infrastructure was run.
Docker status inspection failed with socket permission denied even outside the
sandbox; current container names/health could not be independently confirmed.
Live SQL confirms the central database is reachable regardless of that limitation.

Startup mechanisms found:

- API `npm run dev`: Node env-file loading, tsx, watch mode, `src/server.ts`.
- API `npm start`: Node env-file loading, `dist/server.js`; requires an existing build.
- API Docker runtime: `node dist/server.js`, container port 3000; image readiness
  healthcheck uses `/ready`. The tools image defaults to a migration command and
  must not be used as a harmless startup probe.
- Client `npm run dev`: Vite with the loopback/proxy configuration above.
  `npm run preview` serves a build; no equivalent preview proxy is declared here.

No active Node/npm/Vite process was found in the host process-name inspection.
An enabled systemd/PM2 service or other persistent startup mechanism was not verified.

## D. API endpoint inventory

Source of truth: `src/contracts/api.ts`, mounted by `src/app.ts` and module routers.
Paths are case sensitive. Business JSON responses use the success/data/meta
envelope; failures use the error envelope. Inventory describes source, not a
successful live deployment check.

| Access | Method | Path(s) |
| --- | --- | --- |
| Public | GET | `/health`, `/ready` |
| Public | GET | `/docs`, `/docs/openapi.json`, `/media/demo-placeholder.svg` |
| Public | GET | `/api/products`, `/api/products/offers`, `/api/products/newarrivals`, `/api/products/:id` |
| Public | GET | `/api/categories`, `/api/categories/:title` |
| Public | GET | `/api/information/support` |
| Public | POST | `/api/auth/register`, `/api/auth/login` |
| Public | GET | `/api/shopping-cart/fake-shopping-cart` |
| Bearer | GET | `/api/shopping-cart` |
| Bearer | POST | `/api/shopping-cart/items` |
| Bearer | DELETE | `/api/shopping-cart/items/:id`, `/api/shopping-cart/items` |
| Bearer | POST | `/api/orders/place` |
| Bearer | GET | `/api/orders`, `/api/orders/:id` (owner or ADMIN for detail) |
| ADMIN | POST | `/api/orders/:id/approve`, `/api/orders/:id/reject` |
| ADMIN | GET | `/api/admin/orders` |

All five cart operations also mount under the legacy `/api/ShoppingCart` alias.
Swagger assets are served under `/docs/assets/`. Documentation validation counted
30 method/path operations including cart aliases and 17 historical routes.
**`/api/auth/me` does not exist. Cart PATCH does not exist.** Auth router mounts
only register/login; cart router mounts GET/POST/DELETE. No mutating request was
sent to verify absence. `/ready` runs bounded `SELECT 1`: even a future 200 proves
connectivity only, not schema, catalog, JWT or full integration readiness.

Frontend call sites inspected:

- `src/helpers/api.ts`: same-origin path base, default `/api`; rejects absolute
  external bases. `helpers/loaders.ts` calls product detail; `redux/searchSlice.ts`
  calls product search; `redux/userSlice.ts` calls login.
- `pages/Category.tsx`, `Support.tsx`, `Register.tsx`, `OrderDetail.tsx`, `CheckOut.tsx`:
  category, support, registration, order detail and order placement respectively.
- `contexts/shoppingCart/shoppingCartProvider.tsx` and `hooks/useShoppingCartAction.ts`:
  legacy cart alias read, item POST and clear DELETE. Individual removal and update
  only dispatch local reducer actions; they do not persist to the API.
- Shared fetch helpers include `useApiData.ts` and `useApiWithReducer.ts`.

Legacy addresses `http://152.136.182.210:12231/api` and
`http://localhost:5293/api/orders/...` were removed in the current client HEAD,
verified through its read-only diff. The former payment redirect was removed too.
Search of current client source found no remaining hardcoded external API URL;
the local proxy target remains intentionally fixed in Vite configuration. No
legacy remote endpoint was contacted. This source check does not establish what
any previously built/deployed client bundle contains.

## E. Database isolation evidence

Both host API environment files select central loopback port 55438 with distinct
database/role pairs. Live queries used the private runtime settings with bounded
connections/statements and `BEGIN READ ONLY`, followed by `ROLLBACK`; no business
rows or password metadata were selected.

| Database | Connected role / DB owner / public schema owner | Public base tables | Dev CONNECT | Test CONNECT |
| --- | --- | --- | --- | --- |
| `clu_store_dev` | `clu_dev` | 15 | true | false |
| `clu_store_test` | `clu_test` | 15 | false | true |

Both sessions reported PostgreSQL `18.7 (Debian 18.7-1.pgdg12+2)`.
For both roles, `rolsuper`, `rolcreatedb`, `rolcreaterole`, `rolreplication`, and
`rolbypassrls` were all false. Evidence came from current identity, `pg_roles`,
`pg_database` with `has_database_privilege`, `pg_namespace`, and aggregate
`information_schema.tables` queries. Provisioning source
`init/clu/provision.sql.in` also declares separate owners and revokes PUBLIC
database/schema access. Live cross-CONNECT privilege results confirm separation;
no intentional failed cross-login was necessary.

`scripts/test-database-guard.ts` additionally requires a local `clu_store_test`
target, `clu_test` identity, different development database, no URL options and
non-production mode, and checks actual role privileges. Integration setup holds
an advisory lock and detects leftover fault objects. These guards do not authorize
running mutating integration tests during this milestone. Table counts do not
prove migrations are current or fixtures are complete; neither was asserted.

## F. Toolchain and test commands

Default shell: Node `v22.23.4`, npm `10.9.9`, outside API engines
`>=24 <25` / `>=11 <12`; API `.nvmrc` specifies 24. Installed Node `v24.19.0`
with npm `11.17.0` satisfies the API requirement. Verification used that installation
by setting command-local PATH, without changing global settings.

API: TypeScript 5.9.3, ESLint 10.13.0, Vitest 4.1.12, Supertest 7.3.1,
Prisma/client/adapter 7.10.1, Express 5.3.0 (package declarations).
Client: React 19, Vite 8, TypeScript 7, ESLint 9 ranges; package scripts are
`dev`, `build`, `lint`, `preview`. No client test script or dedicated test runner
is declared; no client build/lint was executed or client files changed.

| API command | Preflight result / use |
| --- | --- |
| `npm run lint` | PASS under Node 24/npm 11; no fix/cache flag |
| `npm run typecheck` | PASS; both TypeScript checks emit no files |
| `npm run docs:check` | PASS; check-only generated artifact comparison; 263 response examples, security/monetary/Postman validation passed, zero embedded tokens/blocked values; original comparison false |
| `npm run test:unit` | DB-free configured suite; not run here; Supertest needs local sockets |
| `npm run test:docs` | Focused docs/mounted-route suite; not run here |
| `npm test`, `npm run test:integration` | NOT RUN: default includes PostgreSQL suite; integration tests mutate fixtures/data and may use fault DDL |

Safe repeatable checks for this report are lint, no-emit typecheck, docs:check,
and GET health/readiness probes. Any future unit run must retain the explicit
unit configuration and consider runner cache artifacts under the report-only rule.
Do not execute migrations, seeds, admin creation, environment setup, fixture
curation, or Compose tool jobs as preflight checks. `npm ci` has a Prisma generate
prepare hook; install/build/docs:generate write artifacts and were not run.

## G. Risks and blockers

1. API and client are stopped. Live health/readiness and browser integration remain
   unverified; database connectivity alone cannot close this gap.
2. Default shell toolchain is incompatible with the API engine declaration.
   Select the installed Node 24/npm 11 for future API work.
3. Client response contract mismatches: login reads `data.token` from the raw
   response instead of the envelope's `data.token`; search treats the raw envelope
   as a product array; cart expects raw `.items`; support expects a string at
   `.data` while the API returns `{html, locale}` inside data. Shared `useApiData`
   parses JSON even for successful 204 DELETE responses and swallows errors,
   allowing caller success/local state updates after failed requests.
4. Registration sends `{username: email, password, confirmPassword}` without the
   required `email`. Checkout sends shipping/payment fields rather than the API's
   persisted-cart `{}` or supported full-SKU payload. Cart mutations also need
   full SKU IDs, server response reconciliation and persistent delete/update design.
5. No auth/me route or quantity PATCH route exists. Agree on client lifecycle and
   cart update behavior before assuming those capabilities; local reducer updates
   currently diverge from persisted cart state. Payment integration is unavailable.
6. Independent API Compose defaults and central runtime settings describe different
   database instances/ports; starting the wrong stack risks testing the wrong data.
7. Docker socket access prevents container health verification. Schema currency,
   seed completeness, client lint/build and end-to-end behavior remain unverified.

Remote-SSH compatibility: forward remote loopback **5178** to a local loopback
port and open that forwarded origin. Relative `/api` calls travel through Vite's
remote proxy to API 3008, so only the Vite port needs forwarding for those calls.
For direct API health/docs inspection, separately forward remote 3008. No public
bind or database forwarding is required. Direct browser API access must match
the allowed origins `http://localhost:5178` or `http://127.0.0.1:5178`; a remapped
browser port needs an operator-reviewed CORS change for direct cross-origin use.
Vite proxies only `/api`; API docs/health/media paths require direct API forwarding
or a separately reviewed proxy configuration. Production/preview reverse proxy
behavior is not established by the development Vite proxy. No actual SSH tunnel
or browser session was exercised.

## H. GO / NO-GO decision

**NO-GO for end-to-end integration acceptance.** The sanitized baseline is complete:
Git state was clean, central database isolation is confirmed, ports/topologies
are distinguished, and API static checks pass. Stopped application services and
identified client/API contract mismatches prevent an integration GO.

Manual operator actions:

1. Review this unstaged report and select Node 24/npm 11 for subsequent work.
2. In a separately authorized implementation milestone, reconcile client response,
   registration, cart, checkout and auth lifecycle contracts; decide whether new
   endpoints are required. Do not infer authorization to change the client here.
3. Start the intended host API on 3008 and Vite on 5178 using the central runtime
   profile, without launching the independent Compose database. Recheck GET
   `/health` and `/ready`, then verify forwarding and read-only browser flows.
4. Resolve Docker inspection access if container health evidence is needed, and
   review schema/fixture status separately before authorizing any mutations/tests.

Suggested commit: `docs(integration): record Ubuntu integration preflight`.
Suggested PR title: `docs(integration): document Ubuntu integration baseline`.
The operator owns staging, committing, pushing and PR creation; none was performed.
