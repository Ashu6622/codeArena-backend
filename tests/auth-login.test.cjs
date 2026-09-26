require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { scryptSync } = require('node:crypto');
const request = require('supertest');
const { AuthModule } = require('../dist/apps/api/src/auth/auth.module');
const { PrismaService } = require('../dist/apps/api/src/prisma/prisma.service');
const { PasswordService } = require('../dist/apps/api/src/auth/password.service');

describe('login and access-token authentication', () => {
  let app;
  let jwt;
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
    refreshSession: { create: jest.fn() },
    problemBookmark: { findMany: jest.fn() },
    problemNote: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const publicUser = {
    id: '9a17a2d3-284d-4c52-8935-a27ee27cbd45',
    email: 'user@example.com',
    name: 'User',
    role: 'USER',
    createdAt: new Date('2026-09-11T00:00:00.000Z'),
  };
  let storedUser;

  beforeAll(async () => {
    const passwordHash = await new PasswordService().hash('correct horse battery staple');
    storedUser = {
      ...publicUser,
      passwordHash,
      updatedAt: new Date('2026-09-11T00:00:00.000Z'),
    };

    const module = await Test.createTestingModule({ imports: [AuthModule] })
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
    prisma.user.findUnique.mockReset();
    prisma.refreshSession.create.mockReset();
    prisma.problemBookmark.findMany.mockReset();
    prisma.problemNote.findMany.mockReset();
    prisma.problemNote.findFirst.mockReset();
    prisma.refreshSession.create.mockResolvedValue({ id: 'session-id' });
    prisma.problemBookmark.findMany.mockResolvedValue([]);
    prisma.problemNote.findMany.mockResolvedValue([]);
    prisma.problemNote.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockImplementation(({ where }) => {
      if (where.email === storedUser.email || where.id === storedUser.id) return storedUser;
      return null;
    });
  });

  it('normalizes email, verifies password, and returns a signed access token', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ' USER@Example.com ', password: 'correct horse battery staple' })
      .expect(200);

    expect(response.body).toEqual({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: '15m',
      user: { ...publicUser, createdAt: publicUser.createdAt.toISOString() },
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(response.headers['set-cookie'][0]).toMatch(
      /^codearena_refresh=[A-Za-z0-9_-]+; Path=\/auth; Expires=.*; HttpOnly; SameSite=Lax$/,
    );
    const rawRefreshToken = response.headers['set-cookie'][0].match(
      /^codearena_refresh=([^;]+)/,
    )[1];
    expect(rawRefreshToken).toHaveLength(43);
    expect(JSON.stringify(prisma.refreshSession.create.mock.calls)).not.toContain(rawRefreshToken);
    expect(prisma.refreshSession.create.mock.calls[0][0].data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });

    const payload = await jwt.verifyAsync(response.body.accessToken, { secret: accessSecret });
    expect(payload).toEqual(
      expect.objectContaining({
        sub: publicUser.id,
        email: publicUser.email,
        role: publicUser.role,
        iat: expect.any(Number),
        exp: expect.any(Number),
      }),
    );
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it.each([
    ['wrong password', 'user@example.com', 'incorrect password'],
    ['unknown email', 'missing@example.com', 'correct horse battery staple'],
  ])('returns the same 401 response for %s', async (_case, email, password) => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(401);

    expect(response.body.message).toBe('Invalid email or password');
  });

  it.each([
    {},
    { email: 'invalid', password: 'password' },
    { email: 'user@example.com', password: '' },
    { email: 'user@example.com', password: 'x'.repeat(129) },
    { email: 'user@example.com', password: 'password', role: 'ADMIN' },
  ])('rejects malformed login input: %j', async (body) => {
    await request(app.getHttpServer()).post('/auth/login').send(body).expect(400);
  });

  it('returns the current profile for a valid Bearer token', async () => {
    const token = await jwt.signAsync(
      { sub: publicUser.id, email: publicUser.email, role: publicUser.role },
      { secret: accessSecret, expiresIn: '15m' },
    );

    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);

    expect(response.body).toEqual({ ...publicUser, createdAt: publicUser.createdAt.toISOString() });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: publicUser.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  });

  it('returns saved bookmarked problems for the current user', async () => {
    prisma.problemBookmark.findMany.mockResolvedValue([
      {
        id: 'bookmark-id',
        createdAt: new Date('2026-09-12T11:00:00.000Z'),
        problem: {
          id: 'problem-id',
          title: 'Two Sum',
          slug: 'two-sum',
          difficulty: 'EASY',
          timeLimitMs: 1000,
          memoryLimitMb: 128,
          tags: [{ tag: { id: 'tag-array-id', name: 'Array', slug: 'array' } }],
          submissions: [{ verdict: 'WRONG_ANSWER' }],
        },
      },
    ]);
    const token = await jwt.signAsync(
      { sub: publicUser.id, email: publicUser.email, role: publicUser.role },
      { secret: accessSecret, expiresIn: '15m' },
    );

    const response = await request(app.getHttpServer())
      .get('/me/bookmarks')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id: 'problem-id',
          title: 'Two Sum',
          slug: 'two-sum',
          difficulty: 'EASY',
          timeLimitMs: 1000,
          memoryLimitMb: 128,
          bookmarkedAt: '2026-09-12T11:00:00.000Z',
          progressStatus: 'ATTEMPTED',
          tags: [{ id: 'tag-array-id', name: 'Array', slug: 'array' }],
        },
      ],
    });
    expect(prisma.problemBookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: publicUser.id, problem: { isPublished: true } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('returns saved private notes for the current user', async () => {
    prisma.problemNote.findMany.mockResolvedValue([
      {
        id: 'note-id',
        content: 'Remember lookup before insert. This note should be easy to scan later.',
        createdAt: new Date('2026-09-12T10:00:00.000Z'),
        updatedAt: new Date('2026-09-12T10:05:00.000Z'),
        problem: {
          id: 'problem-id',
          title: 'Two Sum',
          slug: 'two-sum',
          difficulty: 'EASY',
          tags: [{ tag: { id: 'tag-array-id', name: 'Array', slug: 'array' } }],
          submissions: [{ verdict: 'ACCEPTED' }],
        },
      },
    ]);
    const token = await jwt.signAsync(
      { sub: publicUser.id, email: publicUser.email, role: publicUser.role },
      { secret: accessSecret, expiresIn: '15m' },
    );

    const response = await request(app.getHttpServer())
      .get('/me/notes')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id: 'note-id',
          contentPreview: 'Remember lookup before insert. This note should be easy to scan later.',
          createdAt: '2026-09-12T10:00:00.000Z',
          updatedAt: '2026-09-12T10:05:00.000Z',
          problem: {
            id: 'problem-id',
            title: 'Two Sum',
            slug: 'two-sum',
            difficulty: 'EASY',
            progressStatus: 'SOLVED',
            tags: [{ id: 'tag-array-id', name: 'Array', slug: 'array' }],
          },
        },
      ],
    });
    expect(prisma.problemNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: publicUser.id, problem: { isPublished: true } },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });

  it('returns one private note with latest submitted code for that problem', async () => {
    prisma.problemNote.findFirst.mockResolvedValue({
      id: 'note-id',
      content: 'Use hashmap for complements.',
      createdAt: new Date('2026-09-12T10:00:00.000Z'),
      updatedAt: new Date('2026-09-12T10:05:00.000Z'),
      problem: {
        id: 'problem-id',
        title: 'Two Sum',
        slug: 'two-sum',
        description: 'Find two values that sum to target.',
        difficulty: 'EASY',
        timeLimitMs: 1000,
        memoryLimitMb: 128,
        tags: [{ tag: { id: 'tag-array-id', name: 'Array', slug: 'array' } }],
        submissions: [
          {
            id: 'submission-id',
            language: 'JAVASCRIPT',
            sourceCode: 'function twoSum() { return [0, 1]; }',
            status: 'COMPLETED',
            verdict: 'ACCEPTED',
            runtimeMs: 12,
            createdAt: new Date('2026-09-12T11:00:00.000Z'),
            completedAt: new Date('2026-09-12T11:00:01.000Z'),
          },
        ],
      },
    });
    const token = await jwt.signAsync(
      { sub: publicUser.id, email: publicUser.email, role: publicUser.role },
      { secret: accessSecret, expiresIn: '15m' },
    );

    const response = await request(app.getHttpServer())
      .get('/me/notes/two-sum')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);

    expect(response.body).toEqual({
      note: {
        id: 'note-id',
        content: 'Use hashmap for complements.',
        createdAt: '2026-09-12T10:00:00.000Z',
        updatedAt: '2026-09-12T10:05:00.000Z',
      },
      problem: {
        id: 'problem-id',
        title: 'Two Sum',
        slug: 'two-sum',
        description: 'Find two values that sum to target.',
        difficulty: 'EASY',
        timeLimitMs: 1000,
        memoryLimitMb: 128,
        tags: [{ id: 'tag-array-id', name: 'Array', slug: 'array' }],
      },
      latestSubmission: {
        id: 'submission-id',
        language: 'JAVASCRIPT',
        sourceCode: 'function twoSum() { return [0, 1]; }',
        status: 'COMPLETED',
        verdict: 'ACCEPTED',
        runtimeMs: 12,
        createdAt: '2026-09-12T11:00:00.000Z',
        completedAt: '2026-09-12T11:00:01.000Z',
      },
    });
    expect(prisma.problemNote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: publicUser.id, problem: { slug: 'two-sum', isPublished: true } },
      }),
    );
  });

  it('returns 404 when the current user has no private note for a problem', async () => {
    const token = await jwt.signAsync(
      { sub: publicUser.id, email: publicUser.email, role: publicUser.role },
      { secret: accessSecret, expiresIn: '15m' },
    );

    const response = await request(app.getHttpServer())
      .get('/me/notes/two-sum')
      .set('Authorization', 'Bearer ' + token)
      .expect(404);

    expect(response.body.message).toBe('Problem note not found');
  });

  it.each([
    ['missing header', undefined],
    ['wrong scheme', 'Basic abc'],
    ['missing token', 'Bearer'],
    ['extra header segment', 'Bearer abc extra'],
    ['tampered token', 'Bearer abc.def.ghi'],
  ])('rejects %s', async (_case, authorization) => {
    const call = request(app.getHttpServer()).get('/auth/me');
    if (authorization) call.set('Authorization', authorization);
    const response = await call.expect(401);
    expect(response.body.message).toBe('Authentication required');
  });

  it('rejects expired tokens', async () => {
    const token = await jwt.signAsync(
      { sub: publicUser.id, email: publicUser.email, role: publicUser.role },
      { secret: accessSecret, expiresIn: -1 },
    );
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer ' + token)
      .expect(401);
  });

  it.each([
    { email: publicUser.email, role: publicUser.role },
    { sub: publicUser.id, email: publicUser.email, role: 'SUPER_ADMIN' },
  ])('rejects invalid token payload: %j', async (payload) => {
    const token = await jwt.signAsync(payload, { secret: accessSecret, expiresIn: '15m' });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer ' + token)
      .expect(401);
  });

  it('rejects a valid token when its user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const token = await jwt.signAsync(
      { sub: publicUser.id, email: publicUser.email, role: publicUser.role },
      { secret: accessSecret, expiresIn: '15m' },
    );
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer ' + token)
      .expect(401);
  });

  it('rejects malformed stored password hashes after performing scrypt work', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...storedUser, passwordHash: 'invalid' });
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: publicUser.email, password: 'correct horse battery staple' })
      .expect(401);
  });
});

describe('PasswordService.verify', () => {
  const passwords = new PasswordService();

  it('accepts the matching password and rejects another password', async () => {
    const hash = await passwords.hash('correct horse battery staple');
    await expect(passwords.verify('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(passwords.verify('wrong password', hash)).resolves.toBe(false);
  });

  it('safely rejects missing and malformed hashes', async () => {
    await expect(passwords.verify('password')).resolves.toBe(false);
    await expect(passwords.verify('password', 'scrypt$1$1$1$00$00')).resolves.toBe(false);
  });

  it('stores a 16-byte salt and 64-byte key', async () => {
    const [, , , , salt, key] = (await passwords.hash('password')).split('$');
    expect(Buffer.from(salt, 'hex')).toHaveLength(16);
    expect(Buffer.from(key, 'hex')).toHaveLength(64);
    expect(
      scryptSync('password', Buffer.from(salt, 'hex'), 64, {
        N: 32768,
        r: 8,
        p: 3,
        maxmem: 64 * 1024 * 1024,
      }).toString('hex'),
    ).toBe(key);
  });
});
