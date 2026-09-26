# Problem Tags

## What Was Added

- Added `tags` and `problem_tags` tables through Prisma.
- Connected problems to tags with a many-to-many relation.
- Added `tagSlugs` support in admin create/update problem payloads.
- Added `tag` filtering for public and admin problem list endpoints.
- Seeded the first V1 tags: array, string, hash-map, binary-search, stack, and sliding-window.

## API Notes

- Public list: `GET /problems?tag=array` returns published problems tagged with `array`.
- Admin list: `GET /admin/problems?tag=array` returns matching draft or published problems for admins.
- Create/update problem payloads can include `tagSlugs: string[]`. Slugs must already exist in the `tags` table.
- Responses now include `tags` as `{ id, name, slug }[]` for problem list/detail and admin problem operations.
