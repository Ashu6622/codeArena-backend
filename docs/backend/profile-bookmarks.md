# Profile Bookmarks Backend

## What was added

- Added authenticated `GET /me/bookmarks`.
- Returns the current user's bookmarked published problems.
- Includes problem metadata, tags, bookmarked date, and current progress status.

## Response shape

```json
{
  "items": [
    {
      "id": "problem-id",
      "title": "Two Sum",
      "slug": "two-sum",
      "difficulty": "EASY",
      "timeLimitMs": 1000,
      "memoryLimitMb": 128,
      "bookmarkedAt": "2026-09-12T11:00:00.000Z",
      "progressStatus": "ATTEMPTED",
      "tags": [{ "id": "tag-id", "name": "Array", "slug": "array" }]
    }
  ]
}
```

## Notes

- The endpoint is guarded by the same Bearer-token auth as `/auth/me`.
- Draft problems are excluded through `problem.isPublished = true`.
- Progress is derived from the current user's submissions for each bookmarked problem.
