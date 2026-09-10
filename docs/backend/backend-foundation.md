# Backend Foundation Progress

This document records what has been completed so far in the CodeArena backend setup. We will keep adding similar markdown notes for each backend feature as the project grows.

## Current Scope

The backend is being built according to the CodeArena V1 plan: a small, synchronous LeetCode-style online judge with authentication, problems, code execution, submissions, verdicts, and submission history.

V1 intentionally avoids RabbitMQ, Redis, WebSockets, S3, Kubernetes, microservices, contests, leaderboards, plagiarism detection, and AI features.

## Completed Work

### Backend Folder Structure

Created the initial backend structure:

```text
apps/
  api/
    src/
      auth/
      users/
      problems/
      submissions/
      execution/
      prisma/
      common/
        guards/
        decorators/
        filters/
        interceptors/
      config/
      main.ts

prisma/
  migrations/
  schema.prisma

docker/
  runners/
    javascript/
    python/
```

The `apps/api/src` folder is for NestJS backend source code. The root `prisma/` folder is for Prisma schema and database migrations.

### Git Placeholder Files

Added `.gitkeep` files in empty folders so Git can track the planned structure before real implementation files exist.

These placeholders can be removed once a folder contains actual source files.

### Code Quality Setup

Added basic code quality tooling:

```text
Husky
TypeScript
ESLint
Prettier
Prisma validation
```

The pre-commit hook runs:

```bash
npm run quality
```

The quality command currently runs:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run db:validate
```

This means commits are blocked if TypeScript, linting, formatting, or Prisma schema validation fails.

### Environment Files

Added:

```text
.env
.env.example
```

`.env` is ignored by Git and stores local secrets/config. `.env.example` is committed so other developers know which environment variables are required.

Current env areas:

```text
NODE_ENV
PORT
DATABASE_URL
JWT settings
execution limits
```

### Environment Config And Validation

Added:

```text
apps/api/src/config/env.config.ts
apps/api/src/config/env.validation.ts
```

`env.validation.ts` validates required environment variables using Joi.

`env.config.ts` shapes raw environment variables into grouped app config:

```text
database
jwt
execution
```

This setup will allow the NestJS app to fail fast at startup when required config is missing or invalid.

### Prisma Schema

Added the initial V1 Prisma schema:

```text
prisma/schema.prisma
```

Current models:

```text
User
Problem
ProblemLanguage
TestCase
Submission
```

Current enums:

```text
Role
Difficulty
Language
SubmissionStatus
Verdict
```

The schema supports the core V1 data needs:

```text
users
problems
supported languages per problem
sample and hidden test cases
official submissions and verdict history
```

Important security rule captured by the schema design: hidden test case expected outputs exist in the database, but they must never be exposed through normal user-facing APIs.

## Verification

The backend quality gate was run successfully:

```bash
npm run quality
```

This passed:

```text
TypeScript typecheck
ESLint
Prettier format check
Prisma schema validation
```

## Documentation Convention

For each future backend feature, create a markdown file under:

```text
docs/backend/
```

Recommended file naming:

```text
feature-name.md
```

Each feature document should include:

```text
Purpose
Files added or changed
Main behavior
Important decisions
Validation and tests
Known limitations or next steps
```

This keeps the project easier to review, explain, and continue later.

## Next Backend Step

The next natural setup step is to bootstrap the actual NestJS API app and connect the env config into the root application module.
