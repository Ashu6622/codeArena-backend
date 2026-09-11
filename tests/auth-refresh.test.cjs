require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const request = require('supertest');
const { AuthModule } = require('../dist/apps/api/src/auth/auth.module');
const { PrismaService } = require('../dist/apps/api/src/prisma/prisma.service');
const { PasswordService } = require('../dist/apps/api/src/auth/password.service');

describe('refresh-token rotation and logout', () => {
  let app;
  let storedUser;
  let sessions;
  let nextId;
  const config = {
    getOrThrow: jest.fn((key) => {
      const values = {
        'jwt.accessSecret': 'test-access-secret-with-at-least-32-characters',
        'jwt.accessExpiresIn': '15m',
        'jwt.refreshSecret': 'test-refresh-secret-with-at-least-32-characters',
        'jwt.refreshExpiresIn': '7d',
      };
      if (!values[key]) throw new Error('Unknown test config: ' + key);
      return values[key];
    }),
  };

  const matches = (session, where) => {
    if (where.id && session.id !== where.id) return false;
    if (where.tokenHash && session.tokenHash !== where.tokenHash) return false;
    if (where.familyId && session.familyId !== where.familyId) return false;
    if (where.revokedAt === null && session.revokedAt !== null) return false;
    if (where.expiresAt?.gt && session.expiresAt <= where.expiresAt.gt) return false;
    return true;
  };

  const refreshSession = {
    create: jest.fn(async ({ data }) => {
      const session = {
        id: 'session-' + nextId++,
        ...data,
        revokedAt: null,
        createdAt: new Date(),
      };
      sessions.push(session);
      return session;
    }),
    findUnique: jest.fn(async ({ where }) => {
      const session = sessions.find((item) => item.tokenHash === where.tokenHash);
      return session ? { ...session, user: storedUser } : null;
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      let count = 0;
      for (const session of sessions) {
        if (matches(session, where)) {
          Object.assign(session, data);
          count++;
        }
      }
      return { count };
    }),
  };

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }) =>
        where.email === storedUser.email ? storedUser : null,
      ),
    },
    refreshSession,
    $transaction: jest.fn((callback) => callback({ refreshSession })),
  };

  beforeAll(async () => {
    storedUser = {
      id: '2ad1cb16-670e-45a1-af61-72a8eb4d14db',
      email: 'user@example.com',
      name: 'User',
      role: 'USER',
      passwordHash: await new PasswordService().hash('correct horse battery staple'),
      createdAt: new Date('2026-09-11T00:00:00.000Z'),
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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    sessions = [];
    nextId = 1;
    jest.clearAllMocks();
  });

  const cookieFrom = (response) => response.headers['set-cookie'][0].split(';')[0];
  const login = () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: storedUser.email, password: 'correct horse battery staple' });

  it('rotates the cookie and consumes the previous session', async () => {
    const firstLogin = await login().expect(200);
    const firstCookie = cookieFrom(firstLogin);
    const firstSession = sessions[0];

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = cookieFrom(refreshed);

    expect(secondCookie).not.toBe(firstCookie);
    expect(refreshed.body).toEqual({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: '15m',
      user: {
        id: storedUser.id,
        email: storedUser.email,
        name: storedUser.name,
        role: storedUser.role,
        createdAt: storedUser.createdAt.toISOString(),
      },
    });
    expect(firstSession.revokedAt).toBeInstanceOf(Date);
    expect(sessions).toHaveLength(2);
    expect(sessions[1].familyId).toBe(firstSession.familyId);
    expect(JSON.stringify(sessions)).not.toContain(secondCookie.split('=')[1]);
  });

  it('revokes the active family when a consumed token is reused', async () => {
    const firstCookie = cookieFrom(await login().expect(200));
    const secondCookie = cookieFrom(
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', firstCookie)
        .expect(200),
    );

    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', firstCookie).expect(401);
    expect(sessions.every((session) => session.revokedAt instanceof Date)).toBe(true);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
  });

  it('rejects missing, unknown, and expired refresh tokens', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', 'codearena_refresh=unknown')
      .expect(401);

    const cookie = cookieFrom(await login().expect(200));
    sessions[0].expiresAt = new Date(Date.now() - 1000);
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie).expect(401);
    expect(sessions[0].revokedAt).toBeInstanceOf(Date);
  });

  it('revokes the current session and clears its cookie on logout', async () => {
    const cookie = cookieFrom(await login().expect(200));
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    expect(sessions[0].revokedAt).toBeInstanceOf(Date);
    expect(response.headers['set-cookie'][0]).toMatch(
      /^codearena_refresh=; Path=\/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax$/,
    );
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('keeps logout idempotent when no cookie is present', async () => {
    const response = await request(app.getHttpServer()).post('/auth/logout').expect(204);
    expect(response.headers['set-cookie'][0]).toContain('codearena_refresh=;');
    expect(refreshSession.updateMany).not.toHaveBeenCalled();
  });
});
