require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const request = require('supertest');
const { SubmissionsModule } = require('../dist/apps/api/src/submissions/submissions.module');
const { PrismaService } = require('../dist/apps/api/src/prisma/prisma.service');

describe('POST /submissions', () => {
  let app;
  let jwt;
  const accessSecret = 'test-access-secret-with-at-least-32-characters';
  const userId = '11111111-1111-1111-1111-111111111111';
  const config = {
    getOrThrow: jest.fn((key) => {
      const values = {
        'jwt.accessSecret': accessSecret,
        'jwt.accessExpiresIn': '15m',
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
    submission: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
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
        isSample: true,
        order: 0,
      },
      {
        id: 'hidden-1',
        input: '{"nums":[99,1],"target":100}',
        expectedOutput: '[0,1]',
        isSample: false,
        order: 1,
      },
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
    const module = await Test.createTestingModule({ imports: [SubmissionsModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.problem.findFirst.mockResolvedValue(sampleProblem);
    prisma.submission.create.mockResolvedValue({
      id: 'submission-id',
      createdAt: new Date('2026-09-11T06:00:00.000Z'),
    });
    prisma.submission.update.mockImplementation(async ({ data }) => ({
      status: data.status,
      verdict: data.verdict,
      runtimeMs: data.runtimeMs,
      memoryKb: null,
      runtimeError: data.runtimeError ?? null,
      completedAt: data.completedAt,
    }));
    prisma.submission.findMany.mockResolvedValue([]);
    prisma.submission.count.mockResolvedValue(0);
    prisma.submission.findFirst.mockResolvedValue(null);
  });

  async function accessToken() {
    return jwt.signAsync(
      { sub: userId, email: 'user@example.com', role: 'USER' },
      { secret: accessSecret, expiresIn: '15m' },
    );
  }

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/submissions')
      .send({ problemSlug: 'two-sum', language: 'JAVASCRIPT', code: correctCode })
      .expect(401);

    expect(prisma.problem.findFirst).not.toHaveBeenCalled();
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  it('judges all test cases, stores the submission, and hides hidden case details', async () => {
    const token = await accessToken();
    const response = await request(app.getHttpServer())
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemSlug: ' Two-Sum ', language: 'javascript', code: correctCode })
      .expect(201);

    expect(response.body).toMatchObject({
      submission: {
        id: 'submission-id',
        status: 'COMPLETED',
        verdict: 'ACCEPTED',
        memoryKb: null,
        runtimeError: null,
        createdAt: '2026-09-11T06:00:00.000Z',
      },
      problem: { id: 'problem-id', title: 'Two Sum', slug: 'two-sum', language: 'JAVASCRIPT' },
      verdict: 'ACCEPTED',
      passed: true,
      passedCount: 2,
      totalCount: 2,
      hiddenResults: { passedCount: 1, totalCount: 1 },
    });
    expect(response.body.submission.runtimeMs).toEqual(expect.any(Number));
    expect(response.body.submission.completedAt).toEqual(expect.any(String));
    expect(response.body.sampleResults).toHaveLength(1);
    expect(response.body.sampleResults[0]).toMatchObject({
      testCaseId: 'sample-1',
      order: 0,
      passed: true,
      verdict: 'ACCEPTED',
      input: sampleProblem.testCases[0].input,
      expectedOutput: '[0,1]',
      actualOutput: '[0,1]',
    });
    expect(JSON.stringify(response.body)).not.toContain('99');
    expect(JSON.stringify(response.body)).not.toContain('hidden-1');

    expect(prisma.problem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'two-sum', isPublished: true },
      }),
    );
    const select = prisma.problem.findFirst.mock.calls[0][0].select;
    expect(select.testCases.where).toBeUndefined();
    expect(select.testCases.select).toMatchObject({ isSample: true });
    expect(prisma.submission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId,
          problemId: 'problem-id',
          language: 'JAVASCRIPT',
          sourceCode: correctCode,
          status: 'RUNNING',
        },
      }),
    );
    expect(prisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'submission-id' },
        data: expect.objectContaining({ status: 'COMPLETED', verdict: 'ACCEPTED' }),
      }),
    );
  });

  it('stores wrong answer verdicts', async () => {
    const token = await accessToken();
    const response = await request(app.getHttpServer())
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        problemSlug: 'two-sum',
        language: 'JAVASCRIPT',
        code: 'function twoSum() { return []; }',
      })
      .expect(201);

    expect(response.body.verdict).toBe('WRONG_ANSWER');
    expect(response.body.passed).toBe(false);
    expect(response.body.passedCount).toBe(0);
    expect(response.body.hiddenResults).toEqual({ passedCount: 0, totalCount: 1 });
    expect(prisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verdict: 'WRONG_ANSWER' }) }),
    );
  });

  it('stores compile errors without exposing hidden test case data', async () => {
    const token = await accessToken();
    const response = await request(app.getHttpServer())
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemSlug: 'two-sum', language: 'JAVASCRIPT', code: 'function twoSum( {' })
      .expect(201);

    expect(response.body.verdict).toBe('COMPILE_ERROR');
    expect(response.body.sampleResults[0]).toMatchObject({
      passed: false,
      verdict: 'COMPILE_ERROR',
    });
    expect(response.body.sampleResults[0].error).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('99');
    expect(JSON.stringify(response.body)).not.toContain('hidden-1');
    expect(prisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verdict: 'COMPILE_ERROR' }) }),
    );
  });

  it('rejects unsupported languages, missing problems, and unsafe problem configs', async () => {
    const token = await accessToken();
    await request(app.getHttpServer())
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemSlug: 'two-sum', language: 'PYTHON', code: 'print(1)' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemSlug: 'bad slug', language: 'JAVASCRIPT', code: correctCode })
      .expect(400);

    prisma.problem.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemSlug: 'missing-problem', language: 'JAVASCRIPT', code: correctCode })
      .expect(404);

    prisma.problem.findFirst.mockResolvedValue({ ...sampleProblem, languages: [] });
    await request(app.getHttpServer())
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemSlug: 'two-sum', language: 'JAVASCRIPT', code: correctCode })
      .expect(400);
  });

  it('lists the current user submissions with pagination and optional problem filtering', async () => {
    const token = await accessToken();
    prisma.submission.findMany.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        language: 'JAVASCRIPT',
        status: 'COMPLETED',
        verdict: 'ACCEPTED',
        runtimeMs: 18,
        memoryKb: null,
        createdAt: new Date('2026-09-11T07:00:00.000Z'),
        completedAt: new Date('2026-09-11T07:00:01.000Z'),
        problem: { id: 'problem-id', title: 'Two Sum', slug: 'two-sum', difficulty: 'EASY' },
      },
    ]);
    prisma.submission.count.mockResolvedValue(1);

    const response = await request(app.getHttpServer())
      .get('/submissions?page=2&limit=10&problemSlug=two-sum')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          language: 'JAVASCRIPT',
          status: 'COMPLETED',
          verdict: 'ACCEPTED',
          runtimeMs: 18,
          memoryKb: null,
          createdAt: '2026-09-11T07:00:00.000Z',
          completedAt: '2026-09-11T07:00:01.000Z',
          problem: { id: 'problem-id', title: 'Two Sum', slug: 'two-sum', difficulty: 'EASY' },
        },
      ],
      pagination: { page: 2, limit: 10, total: 1, totalPages: 1 },
    });
    expect(prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, problem: { slug: 'two-sum' } },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.submission.count).toHaveBeenCalledWith({
      where: { userId, problem: { slug: 'two-sum' } },
    });
  });

  it('returns one owned submission with source code', async () => {
    const token = await accessToken();
    prisma.submission.findFirst.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      language: 'JAVASCRIPT',
      sourceCode: correctCode,
      status: 'COMPLETED',
      verdict: 'ACCEPTED',
      runtimeMs: 18,
      memoryKb: null,
      compileOutput: null,
      runtimeError: null,
      createdAt: new Date('2026-09-11T07:00:00.000Z'),
      completedAt: new Date('2026-09-11T07:00:01.000Z'),
      problem: {
        id: 'problem-id',
        title: 'Two Sum',
        slug: 'two-sum',
        difficulty: 'EASY',
        timeLimitMs: 1000,
        memoryLimitMb: 128,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/submissions/22222222-2222-4222-8222-222222222222')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      sourceCode: correctCode,
      verdict: 'ACCEPTED',
      problem: {
        id: 'problem-id',
        title: 'Two Sum',
        slug: 'two-sum',
        difficulty: 'EASY',
        timeLimitMs: 1000,
        memoryLimitMb: 128,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('hidden-1');
    expect(prisma.submission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: '22222222-2222-4222-8222-222222222222', userId } }),
    );
  });

  it('protects submission history and detail routes', async () => {
    await request(app.getHttpServer()).get('/submissions').expect(401);
    await request(app.getHttpServer())
      .get('/submissions/22222222-2222-4222-8222-222222222222')
      .expect(401);

    const token = await accessToken();
    await request(app.getHttpServer())
      .get('/submissions/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    prisma.submission.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/submissions/33333333-3333-4333-8333-333333333333')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
