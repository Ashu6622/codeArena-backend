# API Bootstrap

This document records the first runnable NestJS API setup for CodeArena backend.

## Purpose

Create a minimal backend application that can start successfully, validate environment configuration at startup, and expose a basic health endpoint.

This step does not connect PostgreSQL or Prisma yet. Database connectivity will be added separately.

## Files Added Or Changed

```text
apps/api/src/main.ts
apps/api/src/app.module.ts
apps/api/src/health/health.controller.ts
apps/api/src/health/health.module.ts
package.json
tsconfig.json
```

## Main Behavior

The API now starts through NestJS and loads configuration using:

```text
ConfigModule
env.config.ts
env.validation.ts
```

The server exposes:

```text
GET /health
```

Expected response shape:

```json
{
  "status": "ok",
  "service": "codearena-api",
  "timestamp": "2026-09-10T00:00:00.000Z"
}
```

## App Safety Setup

The bootstrap applies:

```text
Helmet
CORS
Global ValidationPipe
```

The validation pipe is configured with:

```text
whitelist
forbidNonWhitelisted
transform
```

This keeps incoming DTO handling strict once feature endpoints are added.

## Scripts

Added scripts:

```bash
npm run start:dev
npm run build
npm run start
```

The existing quality gate remains:

```bash
npm run quality
```

## Known Limitations

The API currently has only a health endpoint.

PostgreSQL, PrismaService, migrations, auth, users, problems, submissions, and execution logic are still pending.

## Next Step

The subsequent [Prisma setup](./prisma-setup.md) connects the API to locally installed PostgreSQL, without Docker.
