# Leaderboard

## Purpose

Add public rankings based on accepted submissions for published problems.

## Endpoint

- `GET /leaderboard?limit=50`

The endpoint is public and returns ranked users with solved count, accepted submission count, and latest accepted submission time.

## Ranking Rules

Users are sorted by:

1. Unique accepted published problems solved, descending.
2. Total accepted submissions, descending.
3. Latest accepted submission time, descending.

Only `COMPLETED` submissions with verdict `ACCEPTED` are counted. Archived/unpublished problems are not counted in the public leaderboard.

## Files

- `apps/api/src/leaderboard/leaderboard.module.ts`: leaderboard module registration.
- `apps/api/src/leaderboard/leaderboard.controller.ts`: public leaderboard route.
- `apps/api/src/leaderboard/leaderboard.service.ts`: aggregation and ranking logic.
- `apps/api/src/leaderboard/dto/leaderboard-query.dto.ts`: `limit` validation.
- `apps/api/src/app.module.ts`: imports `LeaderboardModule`.
- `tests/leaderboard.test.cjs`: backend ranking and validation coverage.

## Verification

`npm run quality` passed. Prisma validated and 84 backend tests passed.
