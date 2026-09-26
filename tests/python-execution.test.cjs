require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const request = require('supertest');
const { ExecutionModule } = require('../dist/apps/api/src/execution/execution.module');
const { PrismaService } = require('../dist/apps/api/src/prisma/prisma.service');

describe('Python Code Execution (/run)', () => {
  let app;
  const config = {
    getOrThrow: jest.fn((key) => {
      const values = {
        'execution.timeoutMs': 1000,
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
  const pythonSampleProblem = {
    id: 'problem-id-py',
    title: 'Two Sum',
    slug: 'two-sum',
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    languages: [
      {
        language: 'PYTHON',
        functionSignature: 'def twoSum(nums, target)',
      },
    ],
    testCases: [
      {
        id: 'sample-1',
        input: '{"nums":[2,7,11,15],"target":9}',
        expectedOutput: '[0,1]',
        order: 0,
      },
    ],
  };

  const correctPythonCode = `def twoSum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        diff = target - num
        if diff in seen:
            return [seen[diff], i]
        seen[num] = i
    return []`;

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
    prisma.problem.findFirst.mockResolvedValue(pythonSampleProblem);
  });

  it('runs Python code against sample test cases and returns ACCEPTED', async () => {
    const response = await request(app.getHttpServer())
      .post('/run')
      .send({ problemSlug: 'two-sum', language: 'PYTHON', code: correctPythonCode })
      .expect(201);

    expect(response.body).toMatchObject({
      problem: { id: 'problem-id-py', title: 'Two Sum', slug: 'two-sum', language: 'PYTHON' },
      verdict: 'ACCEPTED',
      passed: true,
      passedCount: 1,
      totalCount: 1,
    });
    expect(response.body.results[0]).toMatchObject({
      passed: true,
      verdict: 'ACCEPTED',
      actualOutput: '[0,1]',
    });
  });

  it('returns WRONG_ANSWER when Python function produces incorrect result', async () => {
    const response = await request(app.getHttpServer())
      .post('/run')
      .send({
        problemSlug: 'two-sum',
        language: 'PYTHON',
        code: 'def twoSum(nums, target):\n    return [0, 0]',
      })
      .expect(201);

    expect(response.body.verdict).toBe('WRONG_ANSWER');
    expect(response.body.passed).toBe(false);
  });

  it('returns COMPILE_ERROR on Python SyntaxError', async () => {
    const response = await request(app.getHttpServer())
      .post('/run')
      .send({
        problemSlug: 'two-sum',
        language: 'PYTHON',
        code: 'def twoSum(nums, target):',
      })
      .expect(201);

    expect(response.body.verdict).toBe('COMPILE_ERROR');
    expect(response.body.results[0].error).toContain('SyntaxError');
  });

  it('returns RUNTIME_ERROR when Python code raises an unhandled exception', async () => {
    const response = await request(app.getHttpServer())
      .post('/run')
      .send({
        problemSlug: 'two-sum',
        language: 'PYTHON',
        code: 'def twoSum(nums, target):\n    raise ValueError("custom error")',
      })
      .expect(201);

    expect(response.body.verdict).toBe('RUNTIME_ERROR');
    expect(response.body.results[0].error).toBe('custom error');
  });
});
