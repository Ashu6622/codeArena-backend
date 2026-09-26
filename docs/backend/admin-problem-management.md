# Admin Problem Management

## Purpose

Add admin-only problem management endpoints for viewing drafts, inspecting full problem data, and updating problem content.

## Endpoints

- `GET /admin/problems`: list published and draft problems with filters, language data, test-case count, and submission count.
- `GET /admin/problems/:slug`: load full admin problem detail, including hidden test cases and execution templates.
- `PATCH /admin/problems/:slug`: update problem details, publish status, language config, and test cases.
- `PATCH /admin/problems/:slug/archive`: safely unpublish a problem without deleting submissions or test data.

All endpoints are protected by `JwtAuthGuard` and `AdminGuard`.

## Files

- `apps/api/src/problems/admin-problems.controller.ts`: admin list/detail/update routes plus the existing create route.
- `apps/api/src/problems/problems.service.ts`: admin list, admin detail, and admin update service methods.
- `apps/api/src/problems/dto/admin-list-problems-query.dto.ts`: admin list filters for difficulty, language, publish state, search, and pagination.
- `apps/api/src/problems/dto/update-problem.dto.ts`: partial problem update validation.

## Behavior

The public problem endpoints continue to show only published problems and sample test cases. Admin endpoints can see drafts and hidden test cases.

Updating a problem replaces language configs and test cases when those arrays are provided. This keeps V1 editing straightforward and prevents stale hidden cases from staying attached after an admin save.

Archiving is implemented as unpublishing: `isPublished` becomes `false`, while the problem record, test cases, and submissions remain intact.

Slug uniqueness is still enforced by Prisma. Duplicate slugs return the same conflict message used by problem creation.

## Verification

`npm run quality` passed. Prisma validated and 82 backend tests passed.
