# User Notes Notebook

## Purpose

Expose the current user's saved private problem notes as a notebook-style API.

## Endpoints

- `GET /me/notes`: returns all published problems where the current user has saved a private note.
- `GET /me/notes/:slug`: returns one private note, problem metadata, and the latest submission code for that problem.

Both endpoints require authentication.

## Response Behavior

`GET /me/notes` returns each note with:

- note id
- content preview
- created and updated timestamps
- problem title, slug, difficulty, progress status, and tags

`GET /me/notes/:slug` returns:

- full saved private note
- problem metadata
- latest submission for the current user on that problem, including submitted source code

If the current user does not have a note for the requested problem, the endpoint returns `404 Problem note not found`.

## Files

- `apps/api/src/auth/me.controller.ts`
- `tests/auth-login.test.cjs`

## Verification

Ran `npm run quality`.
