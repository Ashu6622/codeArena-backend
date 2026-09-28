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
