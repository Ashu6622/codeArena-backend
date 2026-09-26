# Admin Tag Management

## What Was Added

- Added an admin-only tags module.
- Added endpoints to list, create, and update problem tags.
- Tag list responses include `problemCount` so the admin UI can show usage.
- Duplicate slugs return `409 Conflict`. Unknown tags on update return `404 Not Found`.

## Endpoints

- `GET /admin/tags`
- `POST /admin/tags` with `{ name, slug? }`
- `PATCH /admin/tags/:slug` with `{ name?, slug? }`

Only users with the `ADMIN` role can access these routes.
