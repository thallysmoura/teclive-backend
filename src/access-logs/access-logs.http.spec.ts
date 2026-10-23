import 'reflect-metadata';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '../auth/auth.controller.js';
import { AuthService } from '../auth/auth.service.js';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { RefreshTokenService } from '../auth/refresh-token.service.js';
import { UsersService } from '../users/users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PresenceGateway } from '../presence/presence.gateway.js';
import { AccessLogsController } from './access-logs.controller.js';
import { AccessLogsService } from './access-logs.service.js';
import { LocationService } from './location.service.js';
import { AccessLogsPermissionGuard } from './access-logs-permission.guard.js';

describe('login audit and consent', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let logs: Record<string, unknown>[];
  let allowed: Set<string>;
  const lookup = vi.fn();
  beforeEach(async () => {
    logs = [];
    allowed = new Set(['admin', 'member-allowed']);
    lookup.mockReset().mockReturnValue({ city: 'Manaus', region: 'Amazonas', country: 'BR' });
    const passwordHash = await bcrypt.hash('test-password', 4);
    const account = (id: string) => ({ id, email: `${id}@example.com`, name: id, avatarUrl: 'https://example.com/avatar.png', role: id.startsWith('admin') ? 'ADMIN' : 'USER', passwordHash, permissions: allowed.has(id) ? ['log_acesso'] : [], status: 'ACTIVE' });
    const prisma = {
      $transaction: async (callback: (tx: PrismaService) => Promise<unknown>) => callback(prisma as unknown as PrismaService),
      accessLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: String(logs.length + 1), createdAt: new Date(), ...data }; logs.push(row); return row; },
        count: async () => logs.length,
        findMany: async ({ skip, take }: { skip: number; take: number }) => logs.slice(skip, skip + take),
      },
    };
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: process.env.JWT_SECRET ?? 'eugestor-dev-secret-change-me' })],
      controllers: [AuthController, AccessLogsController],
      providers: [AuthService, AccessLogsService, JwtStrategy, JwtAuthGuard, AdminGuard, AccessLogsPermissionGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: { findById: async (id: string) => account(id), findByEmail: async (email: string) => email === 'admin@example.com' ? account('admin') : null, recordLogin: async () => {} } },
        { provide: LocationService, useValue: { nearest: lookup } },
        { provide: RefreshTokenService, useValue: { issue: async () => ({ raw: 'test-refresh', ttl: 1000 }) } },
        { provide: PresenceGateway, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = app.get(JwtService);
  });
  afterEach(async () => { await app.close(); });
  const token = (id: string) => jwt.sign({ sub: id, email: `${id}@example.com` });
  const credentials = { email: 'admin@example.com', password: 'test-password' };

  it('records a successful login without location by default', async () => {
    await request(app.getHttpServer()).post('/auth/login').send(credentials).expect(201);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: 'admin', userName: 'admin', status: 'VALID', avatarUrl: 'https://example.com/avatar.png', locationStatus: 'not_requested' });
    expect(logs[0]).not.toHaveProperty('latitude');
    expect(logs[0]).not.toHaveProperty('password');
    expect(lookup).not.toHaveBeenCalled();
  });
  it('records rejected credentials without granting access or storing passwords', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({ ...credentials, password: 'wrong' }).expect(401);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: 'admin', status: 'INVALID', avatarUrl: 'https://example.com/avatar.png' });
    expect(logs[0]).not.toHaveProperty('password');
    expect(logs[0]).not.toHaveProperty('passwordHash');
  });
  it('records an unknown email without attributing it to a registered user', async () => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email: 'unknown@example.com', password: 'wrong' }).expect(401);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(logs[0]).toMatchObject({ userName: 'Usuário não identificado', userEmail: 'unknown@example.com', status: 'INVALID', avatarUrl: null });
    expect(logs[0].userId).toBeUndefined();
  });
  it('ignores supplied coordinates without explicit consent', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({ ...credentials, locationStatus: 'denied', location: { latitude: 1, longitude: 2, accuracy: 10 } }).expect(201);
    expect(logs[0].locationStatus).toBe('denied');
    expect(logs[0]).not.toHaveProperty('latitude');
    expect(lookup).not.toHaveBeenCalled();
  });
  it('stores coordinates and derives place only for shared locations', async () => {
    await request(app.getHttpServer()).post('/auth/login').set('User-Agent', 'Mobile test').send({ ...credentials, locationStatus: 'shared', location: { latitude: -3.1, longitude: -60.02, accuracy: 50 }, city: 'Fake city' }).expect(201);
    expect(logs[0]).toMatchObject({ device: 'mobile', latitude: -3.1, longitude: -60.02, accuracy: 50, city: 'Manaus' });
    expect(lookup).toHaveBeenCalledWith(-3.1, -60.02);
  });
  it('rejects invalid or incomplete shared coordinates', async () => {
    for (const location of [undefined, [], { latitude: 91, longitude: 0, accuracy: 10 }, { latitude: 0, longitude: 181, accuracy: 10 }, { latitude: 0, longitude: 0, accuracy: -1 }]) {
      await request(app.getHttpServer()).post('/auth/login').send({ ...credentials, locationStatus: 'shared', location }).expect(400);
    }
    expect(logs).toHaveLength(0);
  });
  it('limits access to admins and paginates five records', async () => {
    logs = Array.from({ length: 7 }, (_, i) => ({ id: String(i) }));
    await request(app.getHttpServer()).get('/access-logs').expect(401);
    await request(app.getHttpServer()).get('/access-logs').auth(token('member'), { type: 'bearer' }).expect(403);
    const first = await request(app.getHttpServer()).get('/access-logs').auth(token('admin'), { type: 'bearer' }).expect(200);
    expect(first.body.items).toHaveLength(5);
    expect(first.body.total).toBe(7);
    expect(first.headers['cache-control']).toBe('no-store');
    const last = await request(app.getHttpServer()).get('/access-logs?page=99').auth(token('admin'), { type: 'bearer' }).expect(200);
    expect(last.body.page).toBe(2);
    expect(last.body.items).toHaveLength(2);
    await request(app.getHttpServer()).get('/access-logs?page=0').auth(token('admin'), { type: 'bearer' }).expect(400);
  });
  it('requires an explicit grant even for admins and enforces revocation immediately', async () => {
    const access = token('admin');
    await request(app.getHttpServer()).get('/access-logs').auth(token('admin-restricted'), { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get('/access-logs').auth(token('member-allowed'), { type: 'bearer' }).expect(200);
    await request(app.getHttpServer()).get('/access-logs').auth(access, { type: 'bearer' }).expect(200);
    allowed.delete('admin');
    await request(app.getHttpServer()).get('/access-logs').auth(access, { type: 'bearer' }).expect(403);
  });
  it('validates filter dates and prevents inverted periods', async () => {
    for (const query of ['from=not-a-date', 'from=2026-02-30', 'from=2026-10-24T00:00:00Z&until=2026-10-23T00:00:00Z', `search=${'x'.repeat(101)}`]) {
      await request(app.getHttpServer()).get(`/access-logs?${query}`).auth(token('admin'), { type: 'bearer' }).expect(400);
    }
    await request(app.getHttpServer()).get('/access-logs?search=Ana&from=2026-10-23T04:00:00Z&until=2026-10-24T04:00:00Z').auth(token('admin'), { type: 'bearer' }).expect(200);
  });
});
