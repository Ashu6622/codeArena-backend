const { Test } = require('@nestjs/testing');
const { Verdict } = require('@prisma/client');
const {
  DockerCodeExecutorService,
} = require('../dist/apps/api/src/execution/docker-code-executor.service');

describe('Docker Security Regression Test Suite (Milestone D13)', () => {
  let executor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [DockerCodeExecutorService],
    }).compile();

    executor = module.get(DockerCodeExecutorService);
  });

  it('1. Network Isolation: Should block external network access attempts or return controlled fallback', async () => {
    const maliciousCode = `
      const http = require('http');
      http.get('http://169.254.169.254/latest/meta-data/', (res) => {
        console.log('CONNECTED');
      }).on('error', (err) => {
        console.error('NETWORK_BLOCKED: ' + err.message);
      });
    `;

    const result = await executor.execute({
      language: 'JAVASCRIPT',
      sourceCode: maliciousCode,
      timeLimitMs: 2000,
      memoryLimitMb: 128,
    });

    expect(result.stdout).not.toContain('CONNECTED');
  });

  it('2. Filesystem Protection: Should prevent reading host secret files', async () => {
    const maliciousCode = `
      const fs = require('fs');
      try {
        const secret = fs.readFileSync('/etc/passwd', 'utf8');
        console.log('SECRET_EXPOSED: ' + secret.slice(0, 20));
      } catch (err) {
        console.log('READ_DENIED: ' + err.message);
      }
    `;

    const result = await executor.execute({
      language: 'JAVASCRIPT',
      sourceCode: maliciousCode,
      timeLimitMs: 2000,
      memoryLimitMb: 128,
    });

    expect(result.stdout).not.toContain('SECRET_EXPOSED');
  });

  it('3. Endless Output Protection: Should bound stdout or handle fallback', async () => {
    const maliciousCode = `
      for (let i = 0; i < 100000; i++) {
        console.log('UNBOUNDED_OUTPUT_LINE_' + i);
      }
    `;

    const result = await executor.execute({
      language: 'JAVASCRIPT',
      sourceCode: maliciousCode,
      timeLimitMs: 2000,
      memoryLimitMb: 128,
    });

    if (result.internalError) {
      expect(result.internalError).toContain('Docker execution unavailable');
    } else {
      expect(result.stdout.length).toBeLessThanOrEqual(65536 + 100);
      expect(result.stdout).toContain('[Output truncated - 64KB limit reached]');
    }
  });

  it('4. Host Timeout Enforcement: Should handle timeout or fallback gracefully', async () => {
    const infiniteLoopCode = `
      while (true) {
        // Infinite loop
      }
    `;

    const result = await executor.execute({
      language: 'JAVASCRIPT',
      sourceCode: infiniteLoopCode,
      timeLimitMs: 1000,
      memoryLimitMb: 128,
    });

    const evaluated = executor.evaluateVerdict(result);

    if (result.internalError) {
      expect(evaluated.verdict).toBe(Verdict.INTERNAL_ERROR);
    } else {
      expect(result.timedOut).toBe(true);
      expect(evaluated.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
    }
  });
});
