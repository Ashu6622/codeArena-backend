require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { LeaderboardModule } = require('../dist/apps/api/src/leaderboard/leaderboard.module');
const { PrismaService } = require('../dist/apps/api/src/prisma/prisma.service');

describe('Leaderboard API', () => {
  let app;
  const prisma = {
    submission: { findMany: jest.fn() },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [LeaderboardModule] })
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

  it('ranks users by unique solved problems, accepted submissions, and latest accepted time', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        problemId: 'problem-a',
        createdAt: new Date('2026-09-10T10:00:00.000Z'),
        completedAt: new Date('2026-09-10T10:00:01.000Z'),
        user: { id: 'user-1', name: 'Asha', email: 'asha@example.com' },
      },
      {
        problemId: 'problem-b',
        createdAt: new Date('2026-09-11T10:00:00.000Z'),
        completedAt: new Date('2026-09-11T10:00:01.000Z'),
        user: { id: 'user-1', name: 'Asha', email: 'asha@example.com' },
      },
      {
        problemId: 'problem-a',
        createdAt: new Date('2026-09-12T10:00:00.000Z'),
        completedAt: new Date('2026-09-12T10:00:01.000Z'),
        user: { id: 'user-2', name: null, email: 'dev@example.com' },
      },
      {
        problemId: 'problem-a',
        createdAt: new Date('2026-09-09T10:00:00.000Z'),
        completedAt: new Date('2026-09-09T10:00:01.000Z'),
        user: { id: 'user-2', name: null, email: 'dev@example.com' },
      },
      {
        problemId: 'problem-c',
        createdAt: new Date('2026-09-08T10:00:00.000Z'),
        completedAt: null,
        user: { id: 'user-3', name: 'Mira', email: 'mira@example.com' },
      },
    ]);

    const response = await request(app.getHttpServer()).get('/leaderboard?limit=2').expect(200);

    expect(response.body).toEqual({
      items: [
        {
          rank: 1,
          user: { id: 'user-1', name: 'Asha', email: 'asha@example.com' },
          solvedCount: 2,
          acceptedSubmissionCount: 2,
          latestAcceptedAt: '2026-09-11T10:00:01.000Z',
        },
        {
          rank: 2,
          user: { id: 'user-2', name: null, email: 'dev@example.com' },
          solvedCount: 1,
          acceptedSubmissionCount: 2,
          latestAcceptedAt: '2026-09-12T10:00:01.000Z',
        },
      ],
      totalRankedUsers: 3,
      generatedAt: expect.any(String),
    });
    expect(prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'COMPLETED',
          verdict: 'ACCEPTED',
          problem: { isPublished: true },
        },
        select: expect.objectContaining({
          problemId: true,
          user: { select: { id: true, name: true, email: true } },
        }),
      }),
    );
  });

  it('rejects invalid limits', async () => {
    await request(app.getHttpServer()).get('/leaderboard?limit=0').expect(400);
    await request(app.getHttpServer()).get('/leaderboard?limit=101').expect(400);
    expect(prisma.submission.findMany).not.toHaveBeenCalled();
  });
});
