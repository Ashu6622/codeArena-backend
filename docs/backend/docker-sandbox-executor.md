# Docker Sandbox Execution Plan (Backend)

## Overview

The `DockerCodeExecutor` replaces raw host process execution with isolated, resource-bounded Docker containers (`docker run --rm --network none --memory 128m --cpus 0.5 --pids-limit 64 --read-only`).

---

## CodeExecutor Contract (`code-executor.interface.ts`)

```typescript
export type ExecutionLanguage = 'JAVASCRIPT' | 'PYTHON' | 'CPP';

export type ExecutionRequest = {
  language: ExecutionLanguage;
  sourceCode: string;
  stdin?: string;
  timeLimitMs: number;
  memoryLimitMb: number;
};

export type ExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  memoryExceeded?: boolean;
  compileError?: string;
  internalError?: string;
};

export interface CodeExecutor {
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}
```

---

## Implementation Milestones

- [x] **D1: Extract CodeExecutor Interface**: Defined `code-executor.interface.ts`.
- [x] **D2: Build Base Runner Image**: Created `docker/runners/javascript/Dockerfile` and `runner.sh` entrypoint for `codearena-js-runner`.
- [x] **D3: Ephemeral Workspace**: Unique workspace management in `/tmp/codearena/<uuid>/`.
- [x] **D4: Output Capture & Limits**: Bound stdout/stderr to 64KB with automatic truncation.
- [x] **D5: Host-side Timeout**: Application wall-clock timeout (`setTimeout` + SIGKILL + `docker rm -f`).
- [x] **D6-D10: Resource & Isolation Flags**: Implemented `--memory`, `--cpus 0.5`, `--pids-limit 64`, `--network none`, `--read-only`, `--security-opt no-new-privileges`.
- [x] **D11: Verdict Integration**: Implemented `evaluateVerdict` mapping `ExecutionResult` to Prisma `Verdict` (`ACCEPTED`, `WRONG_ANSWER`, `TIME_LIMIT_EXCEEDED`, `RUNTIME_ERROR`, `COMPILE_ERROR`).
- [x] **D12: Guaranteed Cleanup**: Enforced `finally {}` workspace directory and container removal.
- [x] **D13: Security Regression Tests**: Added `tests/docker-security-regression.test.cjs` validating network block, file access prevention, endless output truncation, and host-side TLE enforcement.
