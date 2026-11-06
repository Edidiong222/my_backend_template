import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const email = `e2e-${Date.now()}@example.com`;
  const password = 'e2e-strong-password';
  let tokens: AuthTokens;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.init();

    dataSource = app.get(DataSource);
    await dataSource.runMigrations();
    await dataSource.query('TRUNCATE TABLE "auth_tokens", "refresh_tokens", "users" CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new user', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'E2E', lastName: 'User' })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.email).toBe(email);
    expect(response.body.data).not.toHaveProperty('passwordHash');
  });

  it('logs in and returns access and refresh tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    tokens = response.body.data as AuthTokens;
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
  });

  it('rejects an unauthenticated protected route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.statusCode).toBe(401);
  });

  it('allows an authenticated protected route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    expect(response.body.data.email).toBe(email);
  });

  it('rotates refresh tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);

    const rotated = response.body.data as AuthTokens;
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
    tokens = rotated;
  });

  it('logs out and rejects the revoked refresh token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });

  it('reports database health', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.database).toBe('up');
  });
});
