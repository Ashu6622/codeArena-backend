require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { Prisma } = require('@prisma/client');
const request = require('supertest');
const { TagsModule } = require('../dist/apps/api/src/tags/tags.module');
const { PrismaService } = require('../dist/apps/api/src/prisma/prisma.service');

const tagRecord = {
  id: 'tag-array-id',
  name: 'Array',
  slug: 'array',
  createdAt: new Date('2026-09-12T00:00:00.000Z'),
  updatedAt: new Date('2026-09-12T00:00:00.000Z'),
  _count: { problems: 3 },
};

describe('Admin Tags API', () => {
  let app;
  let jwt;
  let currentRole;
  const userId = '18023279-4c86-4281-922b-981b7ac40879';
  const accessSecret = 'test-access-secret-with-at-least-32-characters';
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
    tag: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [TagsModule] })
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
    prisma.tag.findMany.mockResolvedValue([tagRecord]);
    prisma.tag.create.mockResolvedValue({ ...tagRecord, _count: { problems: 0 } });
    prisma.tag.update.mockResolvedValue({ ...tagRecord, name: 'Arrays', slug: 'arrays' });
  });

  const token = (role) =>
    jwt.signAsync(
      { sub: userId, email: 'admin@example.com', role },
      { secret: accessSecret, expiresIn: '15m' },
    );

  it('lists tags with problem usage counts for admins', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/tags')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id: 'tag-array-id',
          name: 'Array',
          slug: 'array',
          createdAt: '2026-09-12T00:00:00.000Z',
          updatedAt: '2026-09-12T00:00:00.000Z',
          problemCount: 3,
        },
      ],
    });
    expect(prisma.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ name: 'asc' }, { slug: 'asc' }],
        select: expect.objectContaining({ _count: { select: { problems: true } } }),
      }),
    );
  });

  it('creates a tag and derives the slug when omitted', async () => {
    await request(app.getHttpServer())
      .post('/admin/tags')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .send({ name: 'Dynamic Programming' })
      .expect(201);

    expect(prisma.tag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Dynamic Programming', slug: 'dynamic-programming' },
      }),
    );
  });

  it('updates a tag by slug', async () => {
    const response = await request(app.getHttpServer())
      .patch('/admin/tags/array')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .send({ name: 'Arrays', slug: 'arrays' })
      .expect(200);

    expect(response.body.slug).toBe('arrays');
    expect(prisma.tag.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'array' },
        data: { name: 'Arrays', slug: 'arrays' },
      }),
    );
  });

  it('blocks non-admin users', async () => {
    currentRole = 'USER';
    await request(app.getHttpServer())
      .get('/admin/tags')
      .set('Authorization', 'Bearer ' + (await token('USER')))
      .expect(403);
  });

  it('rejects duplicate slugs and invalid payloads', async () => {
    prisma.tag.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await request(app.getHttpServer())
      .post('/admin/tags')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .send({ name: 'Array', slug: 'array' })
      .expect(409);

    await request(app.getHttpServer())
      .post('/admin/tags')
      .set('Authorization', 'Bearer ' + (await token('ADMIN')))
      .send({ name: 'A', extra: true })
      .expect(400);
  });
});
