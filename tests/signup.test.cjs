require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { Prisma } = require('@prisma/client');
const { scryptSync } = require('node:crypto');
const request = require('supertest');
const { AuthModule } = require('../dist/apps/api/src/auth/auth.module');
const { PrismaService } = require('../dist/apps/api/src/prisma/prisma.service');
const { PasswordService } = require('../dist/apps/api/src/auth/password.service');

describe('POST /auth/signup', () => {
  let app;
  const prisma = { user: { create: jest.fn() } };
  const user = {
    id: 'user-id',
    email: 'user@example.com',
    name: 'User',
    role: 'USER',
    createdAt: new Date().toISOString(),
  };
  const valid = {
    email: ' USER@Example.com ',
    name: ' User ',
    password: 'a sufficiently long password',
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    prisma.user.create.mockReset();
  });

  it('normalizes input, hashes the exact password, and returns only public fields', async () => {
    prisma.user.create.mockResolvedValue(user);
    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send(valid)
      .expect(201);
    expect(response.body).toEqual(user);
    const { data, select } = prisma.user.create.mock.calls[0][0];
    expect(data.email).toBe('user@example.com');
    expect(data.name).toBe('User');
    expect(select.passwordHash).toBeUndefined();
    expect(data.passwordHash).not.toContain(valid.password);
    const [algorithm, n, r, p, salt, hash] = data.passwordHash.split('$');
    expect(algorithm).toBe('scrypt');
    expect(Buffer.from(salt, 'hex')).toHaveLength(16);
    const derived = scryptSync(valid.password, Buffer.from(salt, 'hex'), 64, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    expect(derived.toString('hex')).toBe(hash);
  });

  it('accepts an omitted name', async () => {
    prisma.user.create.mockResolvedValue({ ...user, name: null });
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: valid.email, password: valid.password })
      .expect(201);
    expect(prisma.user.create.mock.calls[0][0].data.name).toBeUndefined();
  });

  it.each([
    { email: 'invalid' },
    { email: null },
    { email: 123 },
    { password: 'short' },
    { password: 'x'.repeat(129) },
    { password: null },
    { name: '   ' },
    { name: null },
    { name: 'x'.repeat(81) },
    { role: 'ADMIN' },
    { passwordHash: 'injected' },
  ])('rejects invalid or extra fields: %j', async (override) => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...valid, ...override })
      .expect(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects missing required fields', async () => {
    await request(app.getHttpServer()).post('/auth/signup').send({}).expect(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('maps the database unique constraint to HTTP 409', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['email'] },
      }),
    );
    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send(valid)
      .expect(409);
    expect(response.body.message).toBe('An account with this email already exists');
  });

  it('does not misreport other database errors as duplicate email', async () => {
    app.useLogger(false);
    prisma.user.create.mockRejectedValue(new Error('private database details'));
    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send(valid)
      .expect(500);
    expect(JSON.stringify(response.body)).not.toContain('private database details');
  });
});

test('identical passwords receive different salts and hashes', async () => {
  const passwords = new PasswordService();
  expect(await passwords.hash('a sufficiently long password')).not.toBe(
    await passwords.hash('a sufficiently long password'),
  );
});
