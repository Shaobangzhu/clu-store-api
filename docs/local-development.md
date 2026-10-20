# CLU Store API — local development target

P01 provides the Node 24 / Express 5 runtime, npm scripts and HTTP middleware. Run `npm ci`, copy `.env.example` to `.env`, and use `npm run dev`. Validation commands are `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`; `npm start` runs the compiled server. PostgreSQL, Prisma and Compose remain P02 work.

## Docker topology

```text
Local API process (later `npm run dev`) -- localhost:<chosen host port> --┐
                                                                         v
Compose project:  api service -- postgres:5432 --> PostgreSQL service
                                                       |
                                                 named DB volume

Integration tests --> isolated clu_store_test database (never dev data)
```

The API container connects to service DNS `postgres:5432`; a host-run API connects via `localhost:<chosen host port>`. Choose an isolated Compose project and host port only after inspecting running containers, Compose projects and bound ports. Keep PostgreSQL private to local development; do not bind it publicly. Compose should use a named volume, healthcheck, and API dependency on database health. Inject credentials through ignored `.env` or runtime secret management; a future `.env.example` contains placeholders only. Use explicit migrations, not `db push`, for durable environments.

## Planned workflow

The npm commands above exist in P01. Database migration/seed scripts and Compose commands remain planned. Never point tests at a regular developer database; provision a dedicated test database and verify the connection target before integration tests.

Target stack: Node.js 24 LTS, Express 5, strict TypeScript/ESM, Prisma 7, PostgreSQL. Pin compatible package versions and a current Node patch during bootstrap. Prisma 7 configuration and driver setup must follow its supported PostgreSQL adapter model.

## Gates before any future database startup

1. Inspect `docker ps`, `docker compose ls`, and active host port bindings.
2. Select a unique Compose project and free local host port; use internal `postgres:5432` from the API container.
3. Keep development and test database names/credentials distinct; do not touch existing volumes.
4. Confirm secret values are absent from tracked files and logs; initialize migrations explicitly.
5. Verify readiness and shutdown; transactional tests must use real PostgreSQL.

P01 installs npm dependencies only. Database objects, Docker startup and deployment remain outside this phase. `/ready` intentionally returns 503 until P02 provides a real PostgreSQL probe. The generic rate limiter uses process-local memory; proxy trust is disabled until deployment topology is explicitly configured.
