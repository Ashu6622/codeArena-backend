# Problems Module and Seed Data

## Public Endpoints

### GET /problems

Returns published problems only. Query parameters:

- `page`: positive integer, default 1.
- `limit`: 1 to 50, default 20.
- `difficulty`: `EASY`, `MEDIUM`, or `HARD` (case-insensitive input).
- `language`: `JAVASCRIPT` or `PYTHON` (case-insensitive input).
- `search`: case-insensitive title or slug search, up to 100 characters.

Each list item contains basic metadata and a flat list of supported languages. Descriptions, starter code, execution templates, and test cases are omitted.

### GET /problems/:slug

Returns one published problem with its description, limits, starter code, function signature, and sample test cases. The Prisma query filters `testCases` with `isSample: true`. Hidden inputs and expected outputs are never loaded for this endpoint. Draft and unknown slugs both return HTTP 404.

## Admin Endpoint

### POST /admin/problems

Requires a valid access token and a user whose current PostgreSQL role is `ADMIN`. The role is re-read from the database for each admin request, so demotion takes effect without waiting for the access token to expire.

The request includes title, slug, description, difficulty, limits, publication state, language configurations, and test cases. It requires at least one unique language, at least one sample case, and at least one hidden case. Nested values, sizes, numeric limits, unknown properties, and slug format are validated.

Creation uses Prisma's nested create so the problem, languages, and test cases are written atomically. Duplicate slugs return HTTP 409. The response reports sample/hidden counts without echoing test inputs or expected outputs.

## Seed Data

`prisma/seed.ts` creates or updates:

- One admin account from `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, and optional `SEED_ADMIN_NAME`.
- Two Sum.
- Valid Parentheses.
- Binary Search.
- One JavaScript configuration and four test cases per problem, including sample and hidden cases.

The seed is idempotent by admin email and problem slug. It updates the seeded admin password and role. For each seeded problem, it replaces language configurations and test cases, so do not run it against a database where those seeded records were manually customized.

Set local values in the ignored `.env`; never commit the real password:

```dotenv
SEED_ADMIN_EMAIL=admin@codearena.local
SEED_ADMIN_PASSWORD=choose-a-long-local-password
SEED_ADMIN_NAME=CodeArena Admin
```

Run:

```bash
npm run db:seed
```

The seed fails before writing when the email is missing or the password is outside the signup length range.

## Files

- `apps/api/src/problems/`: controllers, service, DTOs, and module.
- `apps/api/src/common/guards/admin.guard.ts`: current-role authorization.
- `prisma/seed.ts`: repeatable development seed.
- `tests/problems.test.cjs`: public privacy, validation, and admin authorization coverage.

## Next Step

Verified during implementation: the full quality gate passed with 62 tests. A compiled API instance connected to the configured PostgreSQL database and returned HTTP 200 with the expected paginated shape from `GET /problems`; the temporary server was stopped afterward. Permanent seed data was not inserted because the local seed-admin email and password are not configured yet.

The frontend problem library and workspace are connected to these endpoints. Raw JavaScript sample execution is now documented in `code-run.md`. Next, connect the frontend Run button to `POST /run`.
