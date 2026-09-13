# Public User Profile

## What was added

- Added public endpoint `GET /users/:id/public-profile`.
- Added `UsersModule`, `UsersController`, and `UsersService`.
- Leaderboard users can now link to a public coding profile.

## Response data

- Public user id, name, and joined date.
- Solved problem count.
- Attempted published problem count.
- Accepted submission count.
- Up to five recently solved published problems.

## Privacy

- Email and password fields are not returned.
- Only activity for published problems is included.
- The endpoint is public, but validates `:id` as a UUID and returns 404 for unknown users.
