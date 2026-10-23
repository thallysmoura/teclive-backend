import 'reflect-metadata';
import { type INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdminGuard } from '../auth/admin.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('administrative user HTTP authorization', () => {
  const targetId = '937a743d-52dd-4a1b-8bc2-27bf05783491';
  let app: INestApplication;
  let jwt: JwtService;
  let resets = 0;
  let profileUpdates = 0;

  beforeEach(async () => {
    resets = 0;
    profileUpdates = 0;
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: process.env.JWT_SECRET ?? 'eugestor-dev-secret-change-me' })],
      controllers: [UsersController],
      providers: [JwtStrategy, JwtAuthGuard, AdminGuard, {
        provide: UsersService,
        useValue: {
          findById: async (id: string) => ({ id, role: id === 'admin' ? 'ADMIN' : 'USER' }),
          resetPassword: async (id: string) => {
            if (id !== targetId) throw new NotFoundException();
            resets++;
            return { user: { id, name: 'Ana', email: 'ana@gmail.com' }, password: 'generated-for-test' };
          },
          updateProfile: async (id: string, data: { name: string; email: string }) => {
            profileUpdates++;
            return { id, ...data };
          },
        },
      }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = app.get(JwtService);
  });

  afterEach(async () => { await app.close(); });

  it('rejects anonymous and non-admin users without resetting the password', async () => {
    await request(app.getHttpServer()).post(`/users/${targetId}/reset-password`).expect(401);
    await request(app.getHttpServer()).post(`/users/${targetId}/reset-password`)
      .auth(jwt.sign({ sub: 'member', email: 'member@gmail.com' }), { type: 'bearer' }).expect(403);
    expect(resets).toBe(0);
  });

  it('lets an administrator reset a password with an uncacheable response', async () => {
    const response = await request(app.getHttpServer()).post(`/users/${targetId}/reset-password`)
      .auth(jwt.sign({ sub: 'admin', email: 'admin@gmail.com' }), { type: 'bearer' }).expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.password).toBe('generated-for-test');
    expect(resets).toBe(1);
  });

  it('rejects malformed identifiers before resetting anything', async () => {
    await request(app.getHttpServer()).post('/users/invalid/reset-password')
      .auth(jwt.sign({ sub: 'admin', email: 'admin@gmail.com' }), { type: 'bearer' }).expect(400);
    expect(resets).toBe(0);
  });

  it('restricts profile editing to authenticated administrators', async () => {
    const body = { name: 'Ana Maria', email: 'ana@gmail.com' };
    await request(app.getHttpServer()).patch(`/users/${targetId}/profile`).send(body).expect(401);
    await request(app.getHttpServer()).patch(`/users/${targetId}/profile`).send(body)
      .auth(jwt.sign({ sub: 'member', email: 'member@gmail.com' }), { type: 'bearer' }).expect(403);
    expect(profileUpdates).toBe(0);
  });

  it('normalizes profile fields and strips changes to administrative permissions', async () => {
    const response = await request(app.getHttpServer()).patch(`/users/${targetId}/profile`)
      .auth(jwt.sign({ sub: 'admin', email: 'admin@gmail.com' }), { type: 'bearer' })
      .send({ name: '  Ana   Maria  ', email: ' ANA@GMAIL.COM ', role: 'ADMIN', permissions: ['controle_acesso'] }).expect(200);
    expect(response.body.name).toBe('Ana Maria');
    expect(response.body.email).toBe('ana@gmail.com');
    expect(response.body.role).toBeUndefined();
    expect(response.body.permissions).toBeUndefined();
  });

  it('rejects invalid profile fields before saving', async () => {
    await request(app.getHttpServer()).patch(`/users/${targetId}/profile`)
      .auth(jwt.sign({ sub: 'admin', email: 'admin@gmail.com' }), { type: 'bearer' })
      .send({ name: ' ', email: 'fake-email' }).expect(400);
    expect(profileUpdates).toBe(0);
  });
});
