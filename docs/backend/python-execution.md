# Python Execution & Evaluation Support

## Purpose

Add multi-language evaluation capabilities to the backend by introducing the Python execution runner, signature parsing for Python definitions, starter code seeding, and full evaluation in `/run` and `/submissions`.

## Scope & Capabilities

The backend now fully supports both `JAVASCRIPT` and `PYTHON` execution and official submissions.

### Features Added

- **`PythonRunnerService`**: Executes Python 3 code in an isolated child process boundary (`python3 -c ...`).
- **Signature Parsing**: Flexible regex matching supporting both JavaScript signatures (`twoSum(nums: number[], target: number)`) and Python function signatures (`def twoSum(nums, target)`).
- **JSON Formatting Normalization**: Enforces compact JSON output separators (`separators=(',', ':')`) in the Python runner so array and object outputs match JavaScript standard outputs (`"[0,1]"` vs `"[0, 1]"`).
- **Error Handling**:
  - `SyntaxError` -> maps to `COMPILE_ERROR`.
  - Child process timeouts -> maps to `TIME_LIMIT_EXCEEDED`.
  - Unhandled exceptions / memory errors -> maps to `RUNTIME_ERROR`.
  - Result mismatches -> maps to `WRONG_ANSWER`.
  - Matching output -> maps to `ACCEPTED`.
- **Seeded Starter Code**: Added Python starter code and signatures to seeded problems (`Two Sum`, `Valid Parentheses`, `Binary Search`) in `prisma/seed.ts`.

## Files Added & Modified

- `apps/api/src/execution/python-runner.service.ts`: Python child process runner with IPC via JSON over `stdin`/`stdout`.
- `apps/api/src/execution/execution.service.ts`: Injected `PythonRunnerService`, updated `run()` to accept `Language.PYTHON`, and upgraded `parseFunctionSignature()` to parse `def` prefixes.
- `apps/api/src/submissions/submissions.service.ts`: Injected `PythonRunnerService`, updated `create()` to judge Python submissions against sample and hidden test cases.
- `apps/api/src/execution/execution.module.ts`: Provided and exported `PythonRunnerService`.
- `apps/api/src/submissions/submissions.module.ts`: Registered `PythonRunnerService` in providers.
- `prisma/seed.ts`: Added `Language.PYTHON` starter code and function signatures for seeded problems.
- `tests/python-execution.test.cjs`: Comprehensive Jest test suite for Python execution, syntax errors, runtime errors, and output validation.
- `tests/execution.test.cjs`: Updated unsupported language assertions to `RUBY`.
- `tests/submissions.test.cjs`: Updated unsupported language assertions to `RUBY`.

## Security & Isolation

- **Child Process Boundary**: Python code is executed in a separate `python3` process via `spawn()`, isolated from the NestJS main event loop.
- **Process Timeout Safeguard**: Parent process tracks execution time with `setTimeout` and issues a `SIGKILL` signal if execution exceeds the configured timeout (`EXECUTION_TIMEOUT_MS`).
- **Output Size Caps**: Python runner output is bounded by `maxOutputBytes` to prevent buffer overflow or memory exhaustion from infinite print loops.

## Verification

Ran full backend quality gate:

```bash
npm run quality
```

Result:

- **Typecheck**: Passed clean (`tsc --noEmit`).
- **Lint**: Passed clean (`eslint .`).
- **Format**: Passed clean (`prettier --check .`).
- **Prisma**: Schema validated (`prisma validate`).
- **Tests**: 10/10 test suites passed, 115 tests passing.
