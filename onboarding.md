# CLU Store API Onboarding

## Project Overview

This project is a production-style backend for a local specialty e-commerce store inspired by UC Riverside Diane & Kim Wilcox Gift Collection website, California.

Planned product categories include:

- fruit vinegar
- olive oil
- orange blossom honey
- orange jam
- orange honey soap

The backend is being built as a modular monolith first, with a strong focus on interview-ready NestJS architecture and engineering discipline.

## Current Phase Status

Current completed phase work:

- Phase 0 foundation is substantially complete
- Platform foundation, GraphQL setup, config validation, MongoDB, Redis, Docker, health checks, and testing baseline are implemented

Current next phase:

- Phase 1: Auth and Product Catalog Foundation

## Tech Stack

- NestJS
- GraphQL (code-first)
- MongoDB with Mongoose
- Redis with ioredis
- Docker / Docker Compose
- Jest for unit and e2e tests
- TypeScript

## Architecture Summary

The project is designed as a modular monolith.

Current platform-level modules and folders:

- `src/config`
- `src/database`
- `src/cache`
- `src/health`

The long-term module plan includes:

- `AuthModule`
- `UsersModule`
- `ProductsModule`
- `CategoriesModule`
- `CartModule`
- `OrdersModule`
- `InventoryModule`
- `HealthModule`
- `CommonModule`

## API Architecture

The API uses NestJS GraphQL in code-first mode.

Current GraphQL queries implemented:

- `hello`
- `cachePing`
- `health`

Why code-first was chosen:

- best alignment with NestJS and TypeScript
- easier incremental development
- good fit for modular monolith architecture
- interview-friendly for explaining DTO/resolver/service relationships

## Infrastructure Setup

### MongoDB

MongoDB is connected through a dedicated `DatabaseModule` using `MongooseModule.forRootAsync()` and configuration from `ConfigModule`.

Connection source:

- local host mode: `MONGO_URI=mongodb://localhost:27017/clu-store`
- docker app mode: `MONGO_URI=mongodb://mongo:27017/clu-store`

### Redis

Redis is connected through a dedicated `CacheModule` and wrapped in a reusable `CacheService`.

Current cache-related query:

- `cachePing`

Redis configuration differs by runtime mode:

- local host mode: `REDIS_HOST=localhost`
- docker app mode: `REDIS_HOST=redis`

## Environment Strategy

Two environment modes are currently used:

### Local app execution

Uses `.env`

This is for:

- running Nest locally with `npm run start:dev`
- running Mongo and Redis through Docker while app runs on host machine

### Dockerized app execution

Uses `.env.docker`

This is for:

- running app, mongo, and redis together in Docker Compose

## Docker Setup

Current files:

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`

Current compose services:

- `app`
- `mongo`
- `redis`

## How To Run Locally

### Option A: Recommended for development

```bash
docker compose up -d mongo redis
npm run start:dev
```

Then open:

- `http://localhost:3000/graphql`

### Option B: Full Docker Compose

```bash
docker compose up --build
```

Then open:

- `http://localhost:3000/graphql`

## Example GraphQL Queries

### Hello

```graphql
query {
  hello
}
```

### Cache Ping

```graphql
query {
  cachePing
}
```

### Health

```graphql
query {
  health {
    status
    dependencies {
      name
      isHealthy
    }
  }
}
```

## Health Checks

A dedicated `HealthModule` exists.

Current GraphQL health query returns:

- overall status
- dependency health for:
  - application
  - mongo
  - redis

Expected statuses:

- `ok` when all dependencies are healthy
- `degraded` when one or more dependencies are unhealthy

## Testing Strategy

### Unit tests

live close to source code, for example:

- `src/health/health.service.spec.ts`

Purpose:

- validate service logic
- mock infrastructure dependencies
- test branch behavior quickly

### E2E tests

live in the top-level `test/` folder, for example:

- `test/app.e2e-spec.ts`

Purpose:

- validate GraphQL wiring
- validate module integration
- validate full application behavior

Current test coverage baseline includes:

- `hello` GraphQL e2e
- `health` GraphQL e2e
- `HealthService` unit tests

### How To Test

Run unit tests:

```bash
npm run test
```

Run e2e tests:

```bash
npm run test:e2e
```

## Onboarding information

### Key Engineering Decisions

- modular monolith first, not microservices
- GraphQL code-first instead of schema-first
- MongoDB with Mongoose for productivity and Nest integration
- Redis wrapped in `CacheService` instead of used directly everywhere
- unit tests colocated with source
- e2e tests centralized in `test/`
- separate `.env` and `.env.docker` for host vs container runtime clarity

### Completed Phase 0 Tasks

- P0-1 初始化 NestJS 项目骨架与依赖
- P0-2 配置 GraphQL code-first 基础设施
- P0-3 配置 ConfigModule 与环境变量校验
- P0-4 接入 MongoDB 与 Mongoose
- P0-5 接入 Redis 缓存基础设施
- P0-6 配置 Dockerfile 与 docker-compose 本地开发环境
- P0-7 创建 HealthModule 并验证基础可用性
- P0-8 建立 unit test 与 e2e test 基础设施
- P0-9 生成 onboarding.md 跨线程恢复文档

### Current Folder Highlights

```txt
src/
  cache/
  config/
  database/
  health/
  app.module.ts
  app.resolver.ts
  main.ts

test/
  app.e2e-spec.ts
```

### Known Follow-ups / Technical Notes

- Redis disconnection currently produces noisy client error logs; acceptable for now
- Jest e2e currently reports open-handle style exit warning; should be cleaned up later
- health checks currently exist via GraphQL query, but a REST-style infra probe may still be useful later
- no business modules implemented yet
- no auth implemented yet
- no Mongo schemas for business entities implemented yet

### Next Recommended Milestone

Start Phase 1:

- Auth and Product Catalog Foundation
  Recommended first tasks in Phase 1:

1. Design the User schema and authentication boundary
2. Implement register/login with JWT
3. Add GraphQL auth guard and role guard
4. Design Category schema and public query flow
5. Design Product schema and public/admin catalog operations

## How To Resume In A New Thread

Recommended context to mention in the prompt:

- current phase number
- last completed task
- next intended task
- whether you want architecture guidance, implementation steps, or debugging help

Example:

```prompt
now let's resume Phase N+1. Phase N is complete. Last completed task: PN-X onboarding.md. Next task: EPIC-N+1 title.
```
