# C++ Execution & Evaluation Support

## Purpose

Document the addition of C++ (`CPP`) language support, enabling compilation and execution of C++17 source code for sample test runs and official submissions.

## Architecture & Implementation

### 1. `CppRunnerService`

- **Location**: `apps/api/src/execution/cpp-runner.service.ts`
- **Compilation**: Compiles user solution with `g++ -O2 -std=c++17` into an isolated executable binary inside a unique temporary directory (`/tmp/codearena-cpp-XXXXXX`).
- **Harness Generator**: Wraps user C++ code with a lightweight, high-performance C++ JSON parser and serializer.
- **Type Extraction**: Automatically parses function parameter types (`vector<int>`, `int`, `string`, `bool`, etc.) from problem signatures and converts JSON input into strongly-typed C++ function arguments.
- **Cleanup**: Removes all temporary source files and compiled binaries upon execution completion or failure.

### 2. Verdict Evaluation

- **Compilation Error (`COMPILE_ERROR`)**: Captured when `g++` compilation fails (exit code != 0). Returns cleaned compiler output without exposing internal OS temp paths.
- **Time Limit Exceeded (`TIME_LIMIT_EXCEEDED`)**: Parent NestJS process enforces process execution timeout and issues `SIGKILL` to binary if execution exceeds `timeoutMs`.
- **Runtime Error (`RUNTIME_ERROR`)**: Unhandled C++ exceptions or runtime crashes (segmentation fault, out-of-bounds access) map to runtime error verdicts.
- **Output Mismatch (`WRONG_ANSWER`)**: Returned when actual JSON output from C++ function does not match expected output.
- **Success (`ACCEPTED`)**: Returned when output matches expected test case output.

## Code Changes & Files

- `prisma/schema.prisma`: Added `CPP` to `enum Language`.
- `apps/api/src/execution/cpp-runner.service.ts`: C++ compiler runner service and JSON IPC harness.
- `apps/api/src/execution/execution.service.ts`: Registered `CppRunnerService` and added `Language.CPP` execution routing.
- `apps/api/src/submissions/submissions.service.ts`: Registered `CppRunnerService` and added `Language.CPP` submission judging.
- `apps/api/src/execution/execution.module.ts`: Provided and exported `CppRunnerService`.
- `apps/api/src/submissions/submissions.module.ts`: Provided `CppRunnerService`.
- `prisma/seed.ts`: Added C++ starter code and function signatures for seeded problems (`Two Sum`, `Valid Parentheses`, `Binary Search`).
- `tests/cpp-execution.test.cjs`: Integration tests covering C++ compilation, execution, syntax errors, and verdicts.

## Verification

Ran backend quality gate:

```bash
npx prettier --write .
npm run quality
```

Result:

- **Prisma Schema**: Validated `enum Language { JAVASCRIPT, PYTHON, CPP }`.
- **Prisma Client**: Regenerated client (`npm run db:generate`).
- **Tests**: All 11 test suites passed (118 tests total).
