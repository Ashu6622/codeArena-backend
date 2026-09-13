# User Stats Summary

## What Was Added

- Added authenticated `GET /submissions/stats`.
- Stats are derived from the current user's submissions.
- The response includes:
  - `solvedCount`
  - `attemptedCount`
  - `submissionCount`
  - `acceptedSubmissionCount`
  - `acceptanceRate`

## Calculation

- `solvedCount` counts unique problems with at least one accepted submission.
- `attemptedCount` counts unique problems with any submission.
- `acceptanceRate` is accepted submissions divided by total submissions, rounded to a whole percentage.
