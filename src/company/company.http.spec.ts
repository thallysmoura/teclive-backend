import 'reflect-metadata';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { UsersService } from '../users/users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CompanyController } from './company.controller.js';
import { CompanyService, isValidCnpj } from './company.service.js';
import { CompanyPermissionGuard } from './company-permission.guard.js';

const profile = {
  cnpj: '27.037.655/0001-90', legalName: ' Empresa teste ', tradeName: '', email: 'empresa@example.com', phone: '(92) 99999-0000',
  postalCode: '69044-110', street: 'Rua Teste', number: '25', district: 'Planalto', complement: '', city: 'Manaus', state: 'am',
  municipalRegistration: '', stateRegistration: '', substituteRegistration: '', taxRegime: 'SIMPLES_NACIONAL', cnae: '4321500',
  accountantEnabled: false, accountantName: '', accountantEmail: '', accountantPhone: '', accountantCrc: '', logoDataUrl: '', boletoLogoDataUrl: '',
};

describe('company administrator profile', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let stored: Record<string, unknown> | null;
  let admin: boolean;
  let granted: boolean;
  beforeEach(async () => {
    stored = null; admin = true; granted = false;
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: process.env.JWT_SECRET ?? 'eugestor-dev-secret-change-me' })],
      controllers: [CompanyController], providers: [CompanyService, JwtStrategy, JwtAuthGuard, AdminGuard, CompanyPermissionGuard,
        { provide: UsersService, useValue: { findById: async (id: string) => ({ id, role: id === 'admin' && admin ? 'ADMIN' : 'USER', permissions: granted ? ['dados_empresa'] : [] }) } },
        { provide: PrismaService, useValue: { companyProfile: {
          findUnique: async () => stored,
          upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => { stored = stored ? { ...stored, ...update } : create; return stored; },
        } } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init(); jwt = app.get(JwtService);
  });
  afterEach(async () => { await app.close(); });
  const token = (id = 'admin') => jwt.sign({ sub: id, email: `${id}@example.com` });

  it('rejects anonymous and non-admin reads and writes, including after role revocation', async () => {
    for (const path of ['get', 'put'] as const) {
      await request(app.getHttpServer())[path]('/company').send(profile).expect(401);
      await request(app.getHttpServer())[path]('/company').auth(token('member'), { type: 'bearer' }).send(profile).expect(403);
    }
    const access = token(); admin = false;
    await request(app.getHttpServer()).put('/company').auth(access, { type: 'bearer' }).send(profile).expect(403);
    expect(stored).toBeNull();
  });
  it('normalizes and saves a single company, strips unknown properties and updates it', async () => {
    const first = await request(app.getHttpServer()).get('/company').auth(token(), { type: 'bearer' }).expect(200);
    expect(first.headers['cache-control']).toBe('no-store');
    const response = await request(app.getHttpServer()).put('/company').auth(token(), { type: 'bearer' }).send({ ...profile, id: 'other', role: 'ADMIN' }).expect(200);
    expect(response.body).toMatchObject({ id: 'main', cnpj: '27037655000190', legalName: 'Empresa teste', state: 'AM', postalCode: '69044110', phone: '92999990000', logoDataUrl: null });
    expect(response.body).not.toHaveProperty('role');
    await request(app.getHttpServer()).put('/company').auth(token(), { type: 'bearer' }).send({ ...profile, tradeName: 'Atualizado' }).expect(200);
    const read = await request(app.getHttpServer()).get('/company').auth(token(), { type: 'bearer' }).expect(200);
    expect(read.body).toMatchObject({ id: 'main', tradeName: 'Atualizado' });
  });
  it('allows granted users to read but keeps editing admin-only and revokes reads immediately', async () => {
    granted = true;
    const access = token('member');
    await request(app.getHttpServer()).get('/company').auth(access, { type: 'bearer' }).expect(200);
    await request(app.getHttpServer()).put('/company').auth(access, { type: 'bearer' }).send(profile).expect(403);
    granted = false;
    await request(app.getHttpServer()).get('/company').auth(access, { type: 'bearer' }).expect(403);
  });
  it('accepts numeric and alphanumeric CNPJ check digits and rejects invalid ones', () => {
    expect(isValidCnpj('27037655000190')).toBe(true);
    expect(isValidCnpj('12ABC34501DE35')).toBe(true);
    for (const value of ['00000000000000', '27037655000191', '12ABC34501DE36', 'invalid']) expect(isValidCnpj(value)).toBe(false);
  });
  it('rejects invalid required data, CNPJ, accountant details and image payloads without saving', async () => {
    for (const invalid of [
      { legalName: '' }, { cnpj: '27037655000191' }, { postalCode: '123' }, { state: 'XX' }, { taxRegime: 'unknown' },
      { email: 'invalid' }, { accountantEnabled: true }, { accountantEmail: 'invalid' },
      { logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, { logoDataUrl: 'data:image/png;base64,aGVsbG8=' },
    ]) await request(app.getHttpServer()).put('/company').auth(token(), { type: 'bearer' }).send({ ...profile, ...invalid }).expect(400);
    expect(stored).toBeNull();
  });
  it('persists and removes valid logos', async () => {
    const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    await request(app.getHttpServer()).put('/company').auth(token(), { type: 'bearer' }).send({ ...profile, logoDataUrl: logo, boletoLogoDataUrl: logo }).expect(200);
    expect(stored).toMatchObject({ logoDataUrl: logo, boletoLogoDataUrl: logo });
    await request(app.getHttpServer()).put('/company').auth(token(), { type: 'bearer' }).send(profile).expect(200);
    expect(stored).toMatchObject({ logoDataUrl: null, boletoLogoDataUrl: null });
  });
});
