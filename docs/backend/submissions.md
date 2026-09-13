# Judged Submissions Endpoint

## Purpose

Add the first V1 submit flow for saving user code and judging it against all problem test cases.

## Endpoints

### GET /submissions

Requires a valid access token. Returns only the current user's submissions. Query parameters:

- `page`: positive integer, default 1.
- `limit`: 1 to 50, default 20.
- `problemSlug`: optional slug filter for one problem.

List items include submission metadata, verdict, runtime, timestamps, and basic problem metadata. Source code is omitted from the list response.

### GET /submissions/activity

Requires a valid access token. Returns a daily submission count series for the current user. Query parameters:

- `days`: 1 to 366, default 365.

The response includes `from`, `to`, `totalSubmissions`, `maxCount`, and a zero-filled `days` array shaped as `{ date, count }`. This powers the profile activity heatmap.

### GET /submissions/:id

Requires a valid access token. Returns one submission owned by the current user. The detail response includes `sourceCode`, compile/runtime error fields, timestamps, and problem metadata. Unknown submissions and submissions owned by another user both return HTTP 404.

Hidden test cases are not exposed by either read endpoint.

### POST /submissions

Requires a valid access token.

Accepts:

```json
{
  "problemSlug": "two-sum",
  "language": "JAVASCRIPT",
  "code": "function twoSum(nums, target) { ... }"
}
```

## Behavior

The endpoint:

- Normalizes and validates the problem slug and language.
- Supports JavaScript only in this V1 slice.
- Loads the published problem by slug.
- Loads the selected language function signature.
- Loads all test cases, including sample and hidden cases.
- Creates a `RUNNING` submission row before judging.
- Parses test-case inputs as JSON and maps them to the function arguments from `functionSignature`.
- Runs each case in the existing JavaScript worker runner.
- Updates the submission to `COMPLETED` with the final verdict, total runtime, and first runtime error if present.
- Returns full details only for sample cases.

Hidden test case inputs, expected outputs, actual outputs, errors, and IDs are never returned. The response only includes hidden aggregate counts.

## Verdicts

The endpoint can persist and return:

- `ACCEPTED`
- `WRONG_ANSWER`
- `TIME_LIMIT_EXCEEDED`
- `RUNTIME_ERROR`
- `COMPILE_ERROR`
- `INTERNAL_ERROR`

Overall verdict priority is compile error, time limit exceeded, runtime error, wrong answer, then accepted.

## Response Shape

```json
{
  "submission": {
    "id": "submission-id",
    "status": "COMPLETED",
    "verdict": "ACCEPTED",
    "runtimeMs": 24,
    "memoryKb": null,
    "runtimeError": null,
    "createdAt": "2026-09-11T06:00:00.000Z",
    "completedAt": "2026-09-11T06:00:01.000Z"
  },
  "problem": {
    "id": "problem-id",
    "title": "Two Sum",
    "slug": "two-sum",
    "language": "JAVASCRIPT"
  },
  "verdict": "ACCEPTED",
  "passed": true,
  "passedCount": 4,
  "totalCount": 4,
  "sampleResults": [
    {
      "testCaseId": "sample-id",
      "order": 0,
      "passed": true,
      "verdict": "ACCEPTED",
      "input": "{\"nums\":[2,7,11,15],\"target\":9}",
      "expectedOutput": "[0,1]",
      "actualOutput": "[0,1]",
      "runtimeMs": 12
    }
  ],
  "hiddenResults": {
    "passedCount": 2,
    "totalCount": 2
  }
}
```

## Files

- `apps/api/src/submissions/dto/create-submission.dto.ts`: submit request validation.
- `apps/api/src/submissions/dto/list-submissions-query.dto.ts`: history pagination and filter validation.
- `apps/api/src/submissions/dto/submission-id-param.dto.ts`: detail route UUID validation.
- `apps/api/src/submissions/dto/submission-activity-query.dto.ts`: activity range validation.
- `apps/api/src/submissions/submissions.controller.ts`: protected `POST /submissions` route.
- `apps/api/src/submissions/submissions.service.ts`: full-case judging, persistence, privacy filtering, and verdict aggregation.
- `apps/api/src/submissions/submissions.module.ts`: module wiring.
- `apps/api/src/app.module.ts`: root module registration.
- `tests/submissions.test.cjs`: auth, persistence, verdict, validation, and hidden-case privacy coverage.

## Limits

The endpoint uses the same runner limits as `POST /run`:

- `EXECUTION_TIMEOUT_MS`
- `EXECUTION_MEMORY_LIMIT_MB`
- `EXECUTION_MAX_OUTPUT_BYTES`

For each problem, runtime and memory are capped by the smaller value between the problem limits and the configured execution limits.

## Security Notes

This still uses the local V1 JavaScript runner. It is good enough for local development and learning the product flow, but production user-code execution should move into a stronger isolated judge service before public release.

## Verification

Ran `npm run quality`. The full backend quality gate passed with 79 tests, including auth enforcement, persistence, accepted submissions, wrong answers, compile errors, activity aggregation, list pagination/filtering, owned detail lookup, validation failures, missing problems, unsafe problem config, and hidden-case privacy.

## Next Step

Connect the frontend submission history and detail pages to `GET /submissions` and `GET /submissions/:id`.
