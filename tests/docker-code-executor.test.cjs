const { Test } = require('@nestjs/testing');
const { Verdict } = require('@prisma/client');
const {
  DockerCodeExecutorService,
} = require('../dist/apps/api/src/execution/docker-code-executor.service');

describe('DockerCodeExecutorService', () => {
  let executor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [DockerCodeExecutorService],
    }).compile();

    executor = module.get(DockerCodeExecutorService);
  });

  it('should be defined', () => {
    expect(executor).toBeDefined();
  });

  it('should return valid ExecutionResult interface structure', async () => {
    const result = await executor.execute({
      language: 'JAVASCRIPT',
      sourceCode: 'console.log("Hello Sandbox");',
      timeLimitMs: 1000,
      memoryLimitMb: 128,
    });

    expect(result).toHaveProperty('stdout');
    expect(result).toHaveProperty('stderr');
    expect(result).toHaveProperty('exitCode');
    expect(result).toHaveProperty('durationMs');
    expect(result).toHaveProperty('timedOut');
  });

  it('should evaluate ACCEPTED verdict when actual output matches expected', () => {
    const evalResult = executor.evaluateVerdict(
      { stdout: '[0,1]\n', stderr: '', exitCode: 0, durationMs: 42, timedOut: false },
      '[0,1]',
    );
    expect(evalResult.verdict).toBe(Verdict.ACCEPTED);
    expect(evalResult.actualOutput).toBe('[0,1]');
  });

  it('should evaluate WRONG_ANSWER verdict when output mismatches', () => {
    const evalResult = executor.evaluateVerdict(
      { stdout: '[1,2]\n', stderr: '', exitCode: 0, durationMs: 40, timedOut: false },
      '[0,1]',
    );
    expect(evalResult.verdict).toBe(Verdict.WRONG_ANSWER);
    expect(evalResult.actualOutput).toBe('[1,2]');
  });

  it('should evaluate TIME_LIMIT_EXCEEDED verdict on timeout', () => {
    const evalResult = executor.evaluateVerdict(
      { stdout: '', stderr: '', exitCode: 124, durationMs: 3001, timedOut: true },
      '[0,1]',
    );
    expect(evalResult.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
  });

  it('should evaluate RUNTIME_ERROR verdict on process error', () => {
    const evalResult = executor.evaluateVerdict(
      {
        stdout: '',
        stderr: 'ReferenceError: x is not defined',
        exitCode: 1,
        durationMs: 20,
        timedOut: false,
      },
      '[0,1]',
    );
    expect(evalResult.verdict).toBe(Verdict.RUNTIME_ERROR);
    expect(evalResult.error).toContain('ReferenceError');
  });
});
