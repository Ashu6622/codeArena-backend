# Problem Progress Status

## What Was Added

- Public problem routes now support optional JWT auth.
- Anonymous users can still browse problems without a token.
- Logged-in users receive `progressStatus` on public problem list/detail responses.
- Problem lists can be filtered with `progressStatus` for logged-in users.
- Progress is derived from submissions:
  - `SOLVED` when the user has an accepted submission.
  - `ATTEMPTED` when the user has submissions but no accepted submission.
  - `NOT_STARTED` when the user has no submissions for that problem.

## API Notes

- `GET /problems` can include `progressStatus` per item when an access token is provided.
- `GET /problems?progressStatus=SOLVED` filters the list for logged-in users.
- `GET /problems/:slug` can include `progressStatus` when an access token is provided.
- Invalid or missing tokens do not block public problem browsing.
