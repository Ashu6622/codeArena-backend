require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { UsersModule } = require('../dist/apps/api/src/users/users.module');
const { PrismaService } = require('../dist/apps/api/src/prisma/prisma.service');

describe('Public user profile API', () => {
  let app;
  const prisma = {
    user: { findUnique: jest.fn() },
  };
  const userId = '9a17a2d3-284d-4c52-8935-a27ee27cbd45';

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [UsersModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
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
  });

  it('returns public stats and recent solved problems without private fields', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      name: 'Asha',
      email: 'asha@example.com',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      submissions: [
        {
          problemId: 'problem-a',
          verdict: 'ACCEPTED',
          createdAt: new Date('2026-09-12T09:00:00.000Z'),
          completedAt: new Date('2026-09-12T09:00:02.000Z'),
          problem: {
            id: 'problem-a',
            title: 'Two Sum',
            slug: 'two-sum',
            difficulty: 'EASY',
            tags: [{ tag: { id: 'tag-array-id', name: 'Array', slug: 'array' } }],
          },
        },
        {
          problemId: 'problem-b',
          verdict: 'WRONG_ANSWER',
          createdAt: new Date('2026-09-11T09:00:00.000Z'),
          completedAt: new Date('2026-09-11T09:00:01.000Z'),
          problem: {
            id: 'problem-b',
            title: 'Binary Search',
            slug: 'binary-search',
            difficulty: 'EASY',
            tags: [],
          },
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/users/' + userId + '/public-profile')
      .expect(200);

    expect(response.body).toEqual({
      user: { id: userId, name: 'Asha', joinedAt: '2026-09-01T00:00:00.000Z' },
      stats: { solvedCount: 1, attemptedCount: 2, acceptedSubmissionCount: 1 },
      recentSolved: [
        {
          id: 'problem-a',
          title: 'Two Sum',
          slug: 'two-sum',
          difficulty: 'EASY',
          solvedAt: '2026-09-12T09:00:02.000Z',
          tags: [{ id: 'tag-array-id', name: 'Array', slug: 'array' }],
        },
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain('asha@example.com');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userId },
        select: expect.objectContaining({
          id: true,
          name: true,
          createdAt: true,
        }),
      }),
    );
  });

  it('returns 404 for unknown users and validates user ids', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/users/' + userId + '/public-profile')
      .expect(404);
    await request(app.getHttpServer()).get('/users/not-a-user/public-profile').expect(400);
  });
});
