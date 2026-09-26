# Problem Bookmarks Backend

## What was added

- Added a `ProblemBookmark` table for one bookmark per user per problem.
- Added authenticated bookmark and unbookmark endpoints.
- Added `isBookmarked` to public problem list and problem detail responses.
- Added `bookmarked=true|false` filtering for authenticated problem lists.

## API

- `PUT /problems/:slug/bookmark` creates or keeps the current user's bookmark.
- `DELETE /problems/:slug/bookmark` removes the current user's bookmark.
- `GET /problems?bookmarked=true` lists bookmarked published problems for the current user.

## Data rules

- Bookmarks are scoped by `userId + problemId`.
- Deleting a user or problem cascades bookmark deletion.
- Draft or missing problems return 404 through the published problem lookup.
