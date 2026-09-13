# Problem Notes

## What Was Added

- Added `problem_notes` table for private user notes.
- Each user can have one note per problem.
- Notes are deleted automatically if the user or problem is deleted.
- Added authenticated endpoints:
  - `GET /problems/:slug/note`
  - `PUT /problems/:slug/note`

## API Notes

- Notes are private to the current authenticated user.
- The problem must be published.
- `PUT /problems/:slug/note` accepts `{ content: string }` up to 10,000 characters.
- Empty content is allowed, which lets the UI clear a note without deleting the row.
