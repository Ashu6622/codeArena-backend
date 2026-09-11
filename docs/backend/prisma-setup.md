# PostgreSQL and Prisma Setup

## Purpose

Connect NestJS to locally installed PostgreSQL using the project's Prisma 6 client. Docker is not used for the database.

## Files and Behavior

- `prisma/schema.prisma` defines User, Problem, ProblemLanguage, TestCase, and Submission.
- `prisma/migrations/` stores versioned database changes; commit migrations with schema changes.
- `apps/api/src/prisma/prisma.service.ts` uses the validated `database.url` configuration, connects during startup, and disconnects during shutdown.
- `apps/api/src/prisma/prisma.module.ts` exports the shared service. Feature modules should import `PrismaModule` to inject it.
- `apps/api/src/main.ts` enables shutdown hooks for signal-driven cleanup.

The API refuses to start if PostgreSQL cannot be reached. `/health` remains a liveness endpoint, not an ongoing database readiness check. Explicit `@Inject(ConfigService)` also supports the existing tsx development runner.

## Local Setup

Start your local PostgreSQL service. On this Mac, PostgreSQL 16 is installed through Homebrew:

```bash
brew services start postgresql@16
```

Create a dedicated local login and database if they do not exist. Use an administrator connection; choose a password at the prompt:

```bash
createuser --login --pwprompt --createdb codearena
createdb --owner=codearena codearena
```

The local role needs CREATEDB for Prisma's development shadow database. Production credentials should not have this privilege. Set `DATABASE_URL` in the ignored `.env` to the matching username, password, host, port, and database. URL-encode special characters in credentials. `.env.example` contains local placeholders only.

```bash
npm run db:generate
npm run db:migrate -- --name init
npm run db:status
npm run start:dev
```

For subsequent schema changes, choose a descriptive migration name instead of `init`. Do not reset an existing database to resolve drift without reviewing its data.

## Commands

- `npm run db:generate`: regenerate the typed client after schema changes or a fresh install.
- `npm run db:migrate -- --name <change>`: create and apply a development migration.
- `npm run db:deploy`: apply committed migrations in deployment environments.
- `npm run db:status`: check migration status.
- `npm run db:studio`: open Prisma's database browser.
- `npm run quality`: run existing static checks; this does not test database connectivity.

## Verification

Verified during implementation:

- Created the local `codearena` role and database using the existing `.env` credentials.
- Applied `20260910181311_init`, creating all five application tables.
- Generated Prisma Client; migration status reports the schema is up to date.
- `npm run quality` and `npm run build` passed.
- A temporary compiled API instance connected and returned HTTP 200 from `/health`, then stopped on SIGTERM.
- An unreachable database URL caused startup to fail with Prisma's connection error.

The smoke-test API was stopped after verification. These were integration smoke checks, not a committed automated test suite.

## Next Feature

Authentication: signup, password hashing, login, and JWT handling.
