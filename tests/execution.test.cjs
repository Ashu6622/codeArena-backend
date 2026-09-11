require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const request = require('supertest');
const { ExecutionModule } = require('../dist/apps/api/src/execution/execution.module');
const { PrismaService } = require('../dist/apps/api/src/prisma/prisma.service');

describe('POST /run', () => {
  let app;
  const config = {
    getOrThrow: jest.fn((key) => {
      const values = {
        'execution.timeoutMs': 75,
        'execution.memoryLimitMb': 64,
        'execution.maxOutputBytes': 1024,
      };
      if (!(key in values)) throw new Error('Unknown test config: ' + key);
      return values[key];
    }),
  };
  const prisma = {
    problem: { findFirst: jest.fn() },
  };
  const sampleProblem = {
    id: 'problem-id',
    title: 'Two Sum',
    slug: 'two-sum',
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    languages: [
      {
        language: 'JAVASCRIPT',
        functionSignature: 'twoSum(nums: number[], target: number): number[]',
      },
    ],
    testCases: [
      {
        id: 'sample-1',
        input: '{"nums":[2,7,11,15],"target":9}',
        expectedOutput: '[0,1]',
        order: 0,
      },
      { id: 'sample-2', input: '{"nums":[3,2,4],"target":6}', expectedOutput: '[1,2]', order: 1 },
    ],
  };
  const correctCode = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (seen.has(complement)) return [seen.get(complement), i];
    seen.set(nums[i], i);
  }
  return [];
}`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [ExecutionModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.problem.findFirst.mockResolvedValue(sampleProblem);
  });

  it('runs JavaScript against sample cases and returns accepted results', async () => {
    const response = await request(app.getHttpServer())
      .post('/run')
      .send({ problemSlug: ' Two-Sum ', language: 'javascript', code: correctCode })
      .expect(201);

    expect(response.body).toMatchObject({
      problem: { id: 'problem-id', title: 'Two Sum', slug: 'two-sum', language: 'JAVASCRIPT' },
      verdict: 'ACCEPTED',
      passed: true,
      passedCount: 2,
      totalCount: 2,
    });
    expect(response.body.runtimeMs).toEqual(expect.any(Number));
    expect(response.body.results).toHaveLength(2);
    expect(response.body.results[0]).toMatchObject({
      testCaseId: 'sample-1',
      order: 0,
      passed: true,
      verdict: 'ACCEPTED',
      input: sampleProblem.testCases[0].input,
      expectedOutput: '[0,1]',
      actualOutput: '[0,1]',
    });
    expect(prisma.problem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'two-sum', isPublished: true },
      }),
    );
    const select = prisma.problem.findFirst.mock.calls[0][0].select;
    expect(select.testCases.where).toEqual({ isSample: true });
    expect(JSON.stringify(response.body)).not.toContain('hidden-secret');
  });

  it('returns wrong answer when sample output differs', async () => {
    const response = await request(app.getHttpServer())
      .post('/run')
      .send({
        problemSlug: 'two-sum',
        language: 'JAVASCRIPT',
        code: 'function twoSum() { return [0, 0]; }',
      })
      .expect(201);

    expect(response.body.verdict).toBe('WRONG_ANSWER');
    expect(response.body.passed).toBe(false);
    expect(response.body.passedCount).toBe(0);
    expect(response.body.results.every((result) => result.verdict === 'WRONG_ANSWER')).toBe(true);
  });

  it('returns compile and runtime errors without leaking stack traces', async () => {
    const compile = await request(app.getHttpServer())
      .post('/run')
      .send({ problemSlug: 'two-sum', language: 'JAVASCRIPT', code: 'function twoSum( {' })
      .expect(201);
    expect(compile.body.verdict).toBe('COMPILE_ERROR');
    expect(compile.body.results[0].error).toEqual(expect.any(String));
    expect(compile.body.results[0].error).not.toContain('/Users/');

    const runtime = await request(app.getHttpServer())
      .post('/run')
      .send({
        problemSlug: 'two-sum',
        language: 'JAVASCRIPT',
        code: 'function twoSum() { throw new Error("boom"); }',
      })
      .expect(201);
    expect(runtime.body.verdict).toBe('RUNTIME_ERROR');
    expect(runtime.body.results[0].error).toBe('boom');
  });

  it('terminates long running code', async () => {
    const response = await request(app.getHttpServer())
      .post('/run')
      .send({
        problemSlug: 'two-sum',
        language: 'JAVASCRIPT',
        code: 'function twoSum() { while (true) {} }',
      })
      .expect(201);

    expect(response.body.verdict).toBe('TIME_LIMIT_EXCEEDED');
    expect(response.body.results[0]).toMatchObject({
      passed: false,
      verdict: 'TIME_LIMIT_EXCEEDED',
    });
  });

  it('returns 404 for draft or unknown problems', async () => {
    prisma.problem.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post('/run')
      .send({ problemSlug: 'missing-problem', language: 'JAVASCRIPT', code: correctCode })
      .expect(404);
  });

  it('rejects unsupported languages and malformed payloads before running code', async () => {
    await request(app.getHttpServer())
      .post('/run')
      .send({ problemSlug: 'two-sum', language: 'PYTHON', code: 'print(1)' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/run')
      .send({ problemSlug: 'bad slug', language: 'JAVASCRIPT', code: correctCode })
      .expect(400);

    await request(app.getHttpServer())
      .post('/run')
      .send({ problemSlug: 'two-sum', language: 'JAVASCRIPT', code: '', extra: true })
      .expect(400);
  });

  it('rejects problems that cannot be executed safely', async () => {
    prisma.problem.findFirst.mockResolvedValue({
      ...sampleProblem,
      languages: [{ language: 'JAVASCRIPT', functionSignature: null }],
    });
    await request(app.getHttpServer())
      .post('/run')
      .send({ problemSlug: 'two-sum', language: 'JAVASCRIPT', code: correctCode })
      .expect(400);

    prisma.problem.findFirst.mockResolvedValue({ ...sampleProblem, languages: [] });
    await request(app.getHttpServer())
      .post('/run')
      .send({ problemSlug: 'two-sum', language: 'JAVASCRIPT', code: correctCode })
      .expect(400);
  });
});
