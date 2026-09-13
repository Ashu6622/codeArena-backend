# Problem Discussions

## What was added

- Added `ProblemComment` table for public discussion comments on problems.
- Added public comment listing for published problems.
- Added authenticated comment creation.

## API

- `GET /problems/:slug/comments` returns up to 50 newest comments.
- `POST /problems/:slug/comments` creates a comment for the current user.

## Rules

- Comments are tied to published problems.
- Comment creation requires a Bearer token.
- Content is trimmed and must be 1 to 2,000 characters.
- User and problem deletion cascades comment deletion.
