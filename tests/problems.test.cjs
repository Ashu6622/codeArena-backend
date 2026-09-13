require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { Prisma } = require('@prisma/client');
const request = require('supertest');
const { ProblemsModule } = require('../dist/apps/api/src/problems/problems.module');
const { PrismaService } = require('../dist/apps/api/src/prisma/prisma.service');

describe('Problems API', () => {
  let app;
  let jwt;
  let currentRole;
  const accessSecret = 'test-access-secret-with-at-least-32-characters';
  const userId = '18023279-4c86-4281-922b-981b7ac40879';
  const config = {
    getOrThrow: jest.fn((key) => {
      const values = {
        'jwt.accessSecret': accessSecret,
        'jwt.accessExpiresIn': '15m',
        'jwt.refreshSecret': 'test-refresh-secret-with-at-least-32-characters',
        'jwt.refreshExpiresIn': '7d',
      };
      if (!values[key]) throw new Error('Unknown test config: ' + key);
      return values[key];
    }),
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    problem: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    submission: { findMany: jest.fn() },
    problemNote: { findUnique: jest.fn(), upsert: jest.fn() },
    problemBookmark: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    problemComment: { findMany: jest.fn(), create: jest.fn() },
  };
  const problemListItem = {
    id: 'problem-id',
    title: 'Two Sum',
    slug: 'two-sum',
    difficulty: 'EASY',
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    languages: [{ language: 'JAVASCRIPT' }],
    tags: [{ tag: { id: 'tag-array-id', name: 'Array', slug: 'array' } }],
  };
  const validProblem = {
    title: ' Pair Sum ',
    slug: 'Pair-Sum',
    description: 'Return the indices of two values that add up to the requested target.',
    difficulty: 'EASY',
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    isPublished: true,
    languages: [
      {
        language: 'JAVASCRIPT',
        starterCode: 'function pairSum(nums, target) {\n  // TODO\n}',
        functionSignature: 'pairSum(nums: number[], target: number): number[]',
      },
    ],
    tagSlugs: ['array', 'hash-map'],
    testCases: [
      { input: '{"nums":[2,7],"target":9}', expectedOutput: '[0,1]', isSample: true },
      { input: '{"nums":[3,3],"target":6}', expectedOutput: '[0,1]', isSample: false },
    ],
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [ProblemsModule] })
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
    currentRole = 'ADMIN';
    prisma.user.findUnique.mockImplementation(async ({ where }) =>
      where.id === userId ? { role: currentRole } : null,
    );
    prisma.problem.findMany.mockResolvedValue([problemListItem]);
    prisma.problem.count.mockResolvedValue(1);
    prisma.submission.findMany.mockResolvedValue([]);
    prisma.problemBookmark.findMany.mockResolvedValue([]);
    prisma.problemBookmark.upsert.mockResolvedValue({
      id: 'bookmark-id',
      createdAt: new Date('2026-09-12T11:00:00.000Z'),
    });
    prisma.problemBookmark.deleteMany.mockResolvedValue({ count: 1 });
    prisma.problemComment.findMany.mockResolvedValue([]);
    prisma.problemComment.create.mockResolvedValue({
      id: 'comment-id',
      content: 'Great sliding window explanation.',
      createdAt: new Date('2026-09-12T12:00:00.000Z'),
      updatedAt: new Date('2026-09-12T12:00:00.000Z'),
      user: { id: userId, name: 'Asha' },
    });
    prisma.problemNote.findUnique.mockResolvedValue(null);
    prisma.problemNote.upsert.mockResolvedValue({
      id: 'note-id',
      content: 'Use a hash map.',
      createdAt: new Date('2026-09-12T10:00:00.000Z'),
      updatedAt: new Date('2026-09-12T10:00:00.000Z'),
    });
  });

  const token = (role) =>
    jwt.signAsync(
      { sub: userId, email: 'admin@example.com', role },
      { secret: accessSecret, expiresIn: '15m' },
    );

  it('lists only selected public metadata with filters and pagination', async () => {
    const response = await request(app.getHttpServer())
      .get('/problems?page=2&limit=5&difficulty=easy&language=javascript&search=sum')
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          ...problemListItem,
          languages: ['JAVASCRIPT'],
          tags: [{ id: 'tag-array-id', name: 'Array', slug: 'array' }],
          isBookmarked: false,
        },
      ],
      pagination: { page: 2, limit: 5, total: 1, totalPages: 1 },
    });
    expect(prisma.submission.findMany).not.toHaveBeenCalled();
    expect(prisma.problem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublished: true,
          difficulty: 'EASY',
          languages: { some: { language: 'JAVASCRIPT' } },
        }),
        skip: 5,
        take: 5,
      }),
    );
    const select = prisma.problem.findMany.mock.calls[0][0].select;
    expect(select.description).toBeUndefined();
    expect(select.testCases).toBeUndefined();
  });

  it('adds progress status to problem lists for authenticated users', async () => {
    prisma.submission.findMany.mockResolvedValue([
      { problemId: 'problem-id', verdict: 'WRONG_ANSWER' },
      { problemId: 'problem-id', verdict: 'ACCEPTED' },
    ]);

    const response = await request(app.getHttpServer())
      .get('/problems?progressStatus=solved')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .expect(200);

    expect(response.body.items[0].progressStatus).toBe('SOLVED');
    expect(prisma.problem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          submissions: { some: { userId, verdict: 'ACCEPTED' } },
        }),
      }),
    );
    expect(prisma.submission.findMany).toHaveBeenCalledWith({
      where: { userId, problemId: { in: ['problem-id'] } },
      select: { problemId: true, verdict: true },
    });
  });

  it('filters bookmarked problem lists for authenticated users', async () => {
    prisma.problemBookmark.findMany.mockResolvedValue([{ problemId: 'problem-id' }]);

    const response = await request(app.getHttpServer())
      .get('/problems?bookmarked=true')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .expect(200);

    expect(response.body.items[0].isBookmarked).toBe(true);
    expect(prisma.problem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookmarks: { some: { userId } },
        }),
      }),
    );
    expect(prisma.problemBookmark.findMany).toHaveBeenCalledWith({
      where: { userId, problemId: { in: ['problem-id'] } },
      select: { problemId: true },
    });
  });

  it.each([
    '?page=0',
    '?limit=51',
    '?difficulty=unknown',
    '?language=ruby',
    '?progressStatus=unknown',
    '?bookmarked=maybe',
    '?unexpected=true',
  ])('rejects invalid list query %s', async (query) => {
    await request(app.getHttpServer())
      .get('/problems' + query)
      .expect(400);
  });

  it('returns sample cases and never selects hidden cases or execution templates', async () => {
    prisma.problem.findFirst.mockResolvedValue({
      ...problemListItem,
      description: 'A sufficiently detailed problem description.',
      languages: [
        {
          language: 'JAVASCRIPT',
          starterCode: 'function twoSum() {}',
          functionSignature: 'twoSum(nums, target)',
        },
      ],
      tags: [{ tag: { id: 'tag-array-id', name: 'Array', slug: 'array' } }],
      testCases: [
        { id: 'sample-id', input: '{"nums":[2,7],"target":9}', expectedOutput: '[0,1]', order: 0 },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/problems/two-sum')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .expect(200);
    expect(response.body.progressStatus).toBe('NOT_STARTED');
    expect(response.body.isBookmarked).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain('hidden-secret');
    const query = prisma.problem.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({ slug: 'two-sum', isPublished: true });
    expect(query.select.testCases.where).toEqual({ isSample: true });
    expect(query.select.languages.select.executionTemplate).toBeUndefined();
  });

  it('returns 404 for a draft or unknown slug', async () => {
    prisma.problem.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer()).get('/problems/draft-problem').expect(404);
  });

  it('rejects malformed public slugs before querying the database', async () => {
    await request(app.getHttpServer()).get('/problems/Invalid%20Slug').expect(400);
    expect(prisma.problem.findFirst).not.toHaveBeenCalled();
  });

  it('bookmarks the current user problem', async () => {
    prisma.problem.findFirst.mockResolvedValue({
      id: 'problem-id',
      title: 'Two Sum',
      slug: 'two-sum',
    });

    const response = await request(app.getHttpServer())
      .put('/problems/two-sum/bookmark')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .expect(200);

    expect(response.body).toEqual({
      problem: { id: 'problem-id', title: 'Two Sum', slug: 'two-sum' },
      isBookmarked: true,
      bookmark: { id: 'bookmark-id', createdAt: '2026-09-12T11:00:00.000Z' },
    });
    expect(prisma.problemBookmark.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_problemId: { userId, problemId: 'problem-id' } },
        update: {},
        create: { userId, problemId: 'problem-id' },
      }),
    );
  });

  it('removes the current user problem bookmark', async () => {
    prisma.problem.findFirst.mockResolvedValue({
      id: 'problem-id',
      title: 'Two Sum',
      slug: 'two-sum',
    });

    const response = await request(app.getHttpServer())
      .delete('/problems/two-sum/bookmark')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .expect(200);

    expect(response.body).toEqual({
      problem: { id: 'problem-id', title: 'Two Sum', slug: 'two-sum' },
      isBookmarked: false,
    });
    expect(prisma.problemBookmark.deleteMany).toHaveBeenCalledWith({
      where: { userId, problemId: 'problem-id' },
    });
  });

  it('protects private problem bookmarks', async () => {
    await request(app.getHttpServer()).put('/problems/two-sum/bookmark').expect(401);
    await request(app.getHttpServer()).delete('/problems/two-sum/bookmark').expect(401);
  });

  it('lists public discussion comments for a problem', async () => {
    prisma.problem.findFirst.mockResolvedValue({
      id: 'problem-id',
      title: 'Two Sum',
      slug: 'two-sum',
    });
    prisma.problemComment.findMany.mockResolvedValue([
      {
        id: 'comment-id',
        content: 'Use a map for complements.',
        createdAt: new Date('2026-09-12T12:00:00.000Z'),
        updatedAt: new Date('2026-09-12T12:00:00.000Z'),
        user: { id: userId, name: 'Asha' },
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/problems/two-sum/comments')
      .expect(200);

    expect(response.body).toEqual({
      problem: { id: 'problem-id', title: 'Two Sum', slug: 'two-sum' },
      items: [
        {
          id: 'comment-id',
          content: 'Use a map for complements.',
          createdAt: '2026-09-12T12:00:00.000Z',
          updatedAt: '2026-09-12T12:00:00.000Z',
          author: { id: userId, name: 'Asha' },
        },
      ],
    });
    expect(prisma.problemComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { problemId: 'problem-id' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  });

  it('creates a discussion comment for the current user', async () => {
    prisma.problem.findFirst.mockResolvedValue({
      id: 'problem-id',
      title: 'Two Sum',
      slug: 'two-sum',
    });

    const response = await request(app.getHttpServer())
      .post('/problems/two-sum/comments')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .send({ content: ' Great sliding window explanation. ' })
      .expect(201);

    expect(response.body.comment.content).toBe('Great sliding window explanation.');
    expect(prisma.problemComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId,
          problemId: 'problem-id',
          content: 'Great sliding window explanation.',
        },
      }),
    );
  });

  it('protects and validates discussion comment creation', async () => {
    await request(app.getHttpServer())
      .post('/problems/two-sum/comments')
      .send({ content: 'hi' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/problems/two-sum/comments')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .send({ content: '   ' })
      .expect(400);
  });

  it('returns the current user private note for a problem', async () => {
    prisma.problem.findFirst.mockResolvedValue({
      id: 'problem-id',
      title: 'Two Sum',
      slug: 'two-sum',
    });
    prisma.problemNote.findUnique.mockResolvedValue({
      id: 'note-id',
      content: 'Use a hash map.',
      createdAt: new Date('2026-09-12T10:00:00.000Z'),
      updatedAt: new Date('2026-09-12T10:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .get('/problems/two-sum/note')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .expect(200);

    expect(response.body).toEqual({
      problem: { id: 'problem-id', title: 'Two Sum', slug: 'two-sum' },
      note: {
        id: 'note-id',
        content: 'Use a hash map.',
        createdAt: '2026-09-12T10:00:00.000Z',
        updatedAt: '2026-09-12T10:00:00.000Z',
      },
    });
    expect(prisma.problemNote.findUnique).toHaveBeenCalledWith({
      where: { userId_problemId: { userId, problemId: 'problem-id' } },
      select: { id: true, content: true, createdAt: true, updatedAt: true },
    });
  });

  it('upserts the current user private note for a problem', async () => {
    prisma.problem.findFirst.mockResolvedValue({
      id: 'problem-id',
      title: 'Two Sum',
      slug: 'two-sum',
    });

    const response = await request(app.getHttpServer())
      .put('/problems/two-sum/note')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .send({ content: ' Use a hash map. ' })
      .expect(200);

    expect(response.body.note.content).toBe('Use a hash map.');
    expect(prisma.problemNote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_problemId: { userId, problemId: 'problem-id' } },
        update: { content: 'Use a hash map.' },
        create: { userId, problemId: 'problem-id', content: 'Use a hash map.' },
      }),
    );
  });

  it('protects and validates private problem notes', async () => {
    await request(app.getHttpServer()).get('/problems/two-sum/note').expect(401);
    await request(app.getHttpServer())
      .put('/problems/two-sum/note')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .send({ content: 42 })
      .expect(400);
  });

  it('allows a current admin to create a problem atomically', async () => {
    prisma.problem.create.mockResolvedValue({
      id: 'new-problem-id',
      title: 'Pair Sum',
      slug: 'pair-sum',
      difficulty: 'EASY',
      isPublished: true,
      createdAt: new Date('2026-09-11T00:00:00.000Z'),
      languages: [{ language: 'JAVASCRIPT' }],
      tags: [{ tag: { id: 'tag-array-id', name: 'Array', slug: 'array' } }],
      _count: { testCases: 2 },
    });

    const response = await request(app.getHttpServer())
      .post('/admin/problems')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .send(validProblem)
      .expect(201);

    expect(response.body).toEqual({
      id: 'new-problem-id',
      title: 'Pair Sum',
      slug: 'pair-sum',
      difficulty: 'EASY',
      isPublished: true,
      createdAt: '2026-09-11T00:00:00.000Z',
      languages: ['JAVASCRIPT'],
      tags: [{ id: 'tag-array-id', name: 'Array', slug: 'array' }],
      testCaseCount: 2,
      sampleTestCaseCount: 1,
      hiddenTestCaseCount: 1,
    });
    const data = prisma.problem.create.mock.calls[0][0].data;
    expect(data.createdById).toBe(userId);
    expect(data.title).toBe('Pair Sum');
    expect(data.slug).toBe('pair-sum');
    expect(data.testCases.create.map((item) => item.order)).toEqual([0, 1]);
    expect(data.tags.create).toEqual([
      { tag: { connect: { slug: 'array' } } },
      { tag: { connect: { slug: 'hash-map' } } },
    ]);
    expect(JSON.stringify(response.body)).not.toContain(validProblem.testCases[1].expectedOutput);
  });

  it('requires authentication and the current database role', async () => {
    await request(app.getHttpServer()).post('/admin/problems').send(validProblem).expect(401);

    currentRole = 'USER';
    await request(app.getHttpServer())
      .post('/admin/problems')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .send(validProblem)
      .expect(403);

    currentRole = 'ADMIN';
    await request(app.getHttpServer())
      .post('/admin/problems')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .send(validProblem)
      .expect(201);
  });

  it.each([
    [{ ...validProblem, languages: [] }, 400],
    [{ ...validProblem, testCases: [validProblem.testCases[0]] }, 400],
    [{ ...validProblem, slug: 'invalid slug' }, 400],
    [{ ...validProblem, role: 'ADMIN' }, 400],
    [{ ...validProblem, timeLimitMs: 99 }, 400],
  ])('rejects invalid create payloads', async (body, status) => {
    await request(app.getHttpServer())
      .post('/admin/problems')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .send(body)
      .expect(status);
    expect(prisma.problem.create).not.toHaveBeenCalled();
  });

  it('requires both sample and hidden cases and unique languages', async () => {
    const adminToken = await token('ADMIN');
    await request(app.getHttpServer())
      .post('/admin/problems')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        ...validProblem,
        testCases: validProblem.testCases.map((item) => ({ ...item, isSample: true })),
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/admin/problems')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        ...validProblem,
        testCases: validProblem.testCases.map((item) => ({ ...item, isSample: false })),
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/admin/problems')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ ...validProblem, languages: [validProblem.languages[0], validProblem.languages[0]] })
      .expect(400);
  });

  it('unpublishes a problem without deleting it', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'problem-id' });
    prisma.problem.update.mockResolvedValue({
      id: 'problem-id',
      title: 'Two Sum',
      slug: 'two-sum',
      difficulty: 'EASY',
      isPublished: false,
      updatedAt: new Date('2026-09-12T00:00:00.000Z'),
      languages: [{ language: 'JAVASCRIPT' }],
      tags: [{ tag: { id: 'tag-array-id', name: 'Array', slug: 'array' } }],
      testCases: [{ isSample: true }, { isSample: false }],
    });

    const response = await request(app.getHttpServer())
      .patch('/admin/problems/two-sum/archive')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .send({})
      .expect(200);

    expect(response.body).toEqual({
      id: 'problem-id',
      title: 'Two Sum',
      slug: 'two-sum',
      difficulty: 'EASY',
      isPublished: false,
      updatedAt: '2026-09-12T00:00:00.000Z',
      languages: ['JAVASCRIPT'],
      tags: [{ id: 'tag-array-id', name: 'Array', slug: 'array' }],
      testCaseCount: 2,
      sampleTestCaseCount: 1,
      hiddenTestCaseCount: 1,
    });
    expect(prisma.problem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'problem-id' },
        data: { isPublished: false },
      }),
    );
  });

  it('blocks non-admin users from unpublishing problems', async () => {
    currentRole = 'USER';

    await request(app.getHttpServer())
      .patch('/admin/problems/two-sum/archive')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .send({})
      .expect(403);

    expect(prisma.problem.update).not.toHaveBeenCalled();
  });

  it('returns 404 when unpublishing an unknown problem', async () => {
    prisma.problem.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .patch('/admin/problems/missing-problem/archive')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .send({})
      .expect(404);
  });

  it('returns 409 for a duplicate slug', async () => {
    prisma.problem.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['slug'] },
      }),
    );
    await request(app.getHttpServer())
      .post('/admin/problems')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .send(validProblem)
      .expect(409);
  });
});
