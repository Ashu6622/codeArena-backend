# Code Run Endpoint

## Purpose

Add the first V1 execution endpoint for running user code against public sample test cases.

## Endpoint

### POST /run

Accepts:

```json
{
  "problemSlug": "two-sum",
  "language": "JAVASCRIPT",
  "code": "function twoSum(nums, target) { ... }"
}
```

The endpoint is public for now because it only runs sample cases and does not create a submission record.

## Behavior

The endpoint:

- Normalizes and validates the problem slug and language.
- Supports JavaScript only in this V1 slice.
- Loads the published problem by slug.
- Loads only the selected language function signature.
- Loads only sample test cases with `isSample: true`.
- Parses sample inputs as JSON.
- Extracts the function name and argument order from `functionSignature`.
- Runs each sample case in a worker thread using Node's `vm` timeout.
- Returns per-sample pass/fail results, expected output, actual output, runtime, and verdict.

Hidden test cases are never loaded or returned by this endpoint.

## Verdicts

The endpoint can return:

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
  "problem": {
    "id": "problem-id",
    "title": "Two Sum",
    "slug": "two-sum",
    "language": "JAVASCRIPT"
  },
  "verdict": "ACCEPTED",
  "passed": true,
  "passedCount": 2,
  "totalCount": 2,
  "runtimeMs": 24,
  "results": [
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
  ]
}
```

## Files

- `apps/api/src/execution/dto/run-code.dto.ts`: request validation.
- `apps/api/src/execution/execution.controller.ts`: `POST /run` route.
- `apps/api/src/execution/execution.service.ts`: problem lookup, sample case loading, argument mapping, and verdict aggregation.
- `apps/api/src/execution/javascript-runner.service.ts`: JavaScript worker and `vm` runner.
- `apps/api/src/execution/execution.module.ts`: module wiring.
- `apps/api/src/app.module.ts`: root module registration.
- `tests/execution.test.cjs`: HTTP and runner behavior coverage.

## Limits

The runner uses existing env values:

- `EXECUTION_TIMEOUT_MS`
- `EXECUTION_MEMORY_LIMIT_MB`
- `EXECUTION_MAX_OUTPUT_BYTES`

For each problem, runtime and memory are capped by the smaller value between the problem limits and the configured execution limits.

## Security Notes

This is a local V1 sample runner, not the final production judge sandbox. It uses a worker thread and `vm` timeout to stop runaway JavaScript and isolate the run from the Nest request thread. Before untrusted public deployment, execution should move to a stronger sandbox such as containerized workers, microVMs, or a dedicated judge service with stricter filesystem, network, CPU, and memory isolation.

## Verification

Ran `npm run quality`. The full backend quality gate passed with 69 tests. Coverage includes accepted runs, wrong answers, compile errors, runtime errors, timeouts, validation failures, unsupported languages, missing problems, non-executable problem config, and sample-only test case selection.

## Next Step

The frontend workspace Run button is connected to `POST /run`. Judged submissions are documented in `submissions.md`; next, connect the frontend Submit button to `POST /submissions`.
