# CodeArena Backend

NestJS + Prisma + PostgreSQL backend for CodeArena V1.

CodeArena V1 is a deliberately small online judge: users can register/login, browse problems, run JavaScript against sample cases, submit JavaScript against hidden cases, and view persisted submission history.

## Prerequisites

- Node.js 24 or compatible current Node version
- npm
- PostgreSQL running locally or remotely
- A database created for CodeArena, for example `codearena_dev_db`

V1 does not require Docker for PostgreSQL in this setup.

## Environment

Create the backend env file:

```bash
cp .env.example .env
```

Update `.env`:

```env
PORT=4000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/codearena_dev_db?schema=public
JWT_ACCESS_SECRET=replace-with-at-least-32-characters
JWT_REFRESH_SECRET=replace-with-at-least-32-characters
SEED_ADMIN_EMAIL=admin@codearena.local
SEED_ADMIN_PASSWORD=replace-with-a-private-password-of-at-least-15-characters
SEED_ADMIN_NAME=CodeArena Admin
EXECUTION_TIMEOUT_MS=3000
EXECUTION_MEMORY_LIMIT_MB=128
EXECUTION_MAX_OUTPUT_BYTES=65536
```

`SEED_ADMIN_PASSWORD` must be 15 to 128 characters.

## Fresh Setup

```bash
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run start:dev
```

The API runs on:

```text
http://localhost:4000
```

Health check:

```bash
curl http://localhost:4000/health
```

## Database Commands

```bash
npm run db:format    # format Prisma schema
npm run db:validate  # validate Prisma schema
npm run db:generate  # generate Prisma client
npm run db:migrate   # create/apply a local development migration
npm run db:deploy    # apply existing migrations
npm run db:seed      # seed admin user and starter data
npm run db:studio    # open Prisma Studio
```

Use `db:deploy` when setting up from existing migrations. Use `db:migrate` only when creating a new migration during development.

## Quality Gate

```bash
npm run quality
```

This runs:

- TypeScript typecheck
- ESLint
- Prettier format check
- Prisma schema validation
- Backend build
- Jest tests

Husky runs the quality gate before commits when hooks are installed.

## Main API Routes

- `GET /health`
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /problems`
- `GET /problems/:slug`
- `POST /run`
- `POST /submissions`
- `GET /submissions`
- `GET /submissions/stats`
- `GET /submissions/activity`
- `GET /submissions/:id`
- `GET /me/bookmarks`
- `PUT /problems/:slug/bookmark`
- `DELETE /problems/:slug/bookmark`
- `GET /problems/:slug/note`
- `PUT /problems/:slug/note`
- `GET /problems/:slug/comments`
- `POST /problems/:slug/comments`
- `GET /leaderboard`
- `GET /users/:id/public-profile`
- `GET /admin/problems`
- `POST /admin/problems`
- `PATCH /admin/problems/:slug`
- `PATCH /admin/problems/:slug/archive`
- `GET /admin/tags`
- `POST /admin/tags`
- `PATCH /admin/tags/:slug`

Admin routes require an authenticated admin user.

## Execution Scope

V1 supports JavaScript only.

The runner executes submitted JavaScript in a separate Node child process, applies a heap limit, uses a `vm` timeout for the function call, limits output size, and lets the Nest parent process kill timed-out executions.

This is enough for local V1 learning and testing, but it is not a production-grade untrusted-code sandbox. Stronger isolation such as containerized workers or microVMs belongs to a later hardening step.

## V1 Demo Checklist

1. Start PostgreSQL and confirm `DATABASE_URL` points to an existing database.
2. Run migrations and seed data.
3. Start the backend on port `4000`.
4. Start the frontend on port `3001`.
5. Register or login.
6. Open a seeded problem such as Two Sum.
7. Edit JavaScript in Monaco.
8. Run sample tests.
9. Submit a wrong answer and receive `WRONG_ANSWER`.
10. Submit a correct answer and receive `ACCEPTED`.
11. Open submission history and verify the result survives refresh/restart.
12. Confirm normal user responses never expose hidden expected outputs.

## Feature Docs

Feature-by-feature notes live in `docs/backend`.
