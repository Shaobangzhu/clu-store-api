# CLU Store API

P01 provides an Express 5 / strict TypeScript / ESM HTTP foundation for Node 24 LTS. Catalog, auth, cart, orders, Prisma and PostgreSQL arrive in later phases.

## Local development

Use Node 24 and npm 11, then run:

```sh
npm ci
cp .env.example .env
npm run dev
```

The default bind address is `127.0.0.1:3000`. Configure `HOST` explicitly for container access later. `.env` is ignored. See `.env.example` for validated configuration; `CORS_ORIGINS` accepts comma-separated exact HTTP(S) origins, and an empty value permits no browser cross-origin access. Requests without an Origin header are accepted.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`src/app.ts` exports `createApp(config)` without binding a port. `src/server.ts` loads validated environment configuration, listens, and drains HTTP connections on SIGINT/SIGTERM with a bounded shutdown deadline. Development and start scripts load an optional `.env` using Node's native loader.

## Implemented operational endpoints

- `GET /health`: `200` with `{success:true,data:{status:"ok"},meta:null}`; process liveness only.
- `GET /ready`: `503 SERVICE_NOT_READY` with `details.database = "not_configured"`; database readiness is pending P02.

Unknown routes return an error envelope with `404 NOT_FOUND`. Only these two operational routes are implemented. Responses include a generated `X-Request-Id`; logs record request ID/method/status/duration without request bodies, headers or raw URLs. Helmet, allowlisted CORS, a JSON size cap and an in-memory generic rate limiter are enabled. Proxy trust is disabled; configure it deliberately before any reverse proxy or multi-process deployment.

Reusable Zod validation accepts an object with `params`, `query` and/or `body` schemas. Parsed values and transforms are stored in `res.locals.validated`, preserving Express 5 request getters. The success helper is `res.locals.success(data, status?, meta?)`; error handling emits stable codes without exposing internal error messages.

## Documentation and planning

Current V1 decisions and compatibility constraints live in [docs/architecture.md](docs/architecture.md) and [docs/api-contract.md](docs/api-contract.md). See [docs/local-development.md](docs/local-development.md) for the P02 Docker/database plan and [docs/fixture-provenance.md](docs/fixture-provenance.md) for missing source inputs.

The original planning package remains under `documents/`: source audit, architecture/API proposal, implementation roadmap and phase prompts. It describes historical sources and future work; it is not evidence that those features are implemented. Original Postman material contains sensitive bearer-like values and must not be committed.
