import 'reflect-metadata';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { SidebarItem } from '@prisma/client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { UsersService } from '../users/users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NavigationController } from './navigation.controller.js';
import { NavigationService } from './navigation.service.js';

describe('sidebar HTTP access control', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let items: SidebarItem[];
  let memberPermissions: string[];
  beforeEach(async () => {
    items = [{ key: 'inicio', label: 'Início', href: '/home', section: 'main', sortOrder: 0, embedUrl: null, parentKey: null, createdById: null }];
    memberPermissions = [];
    const account = async (id: string) => ({ id, role: id.startsWith('admin') ? 'ADMIN' : 'USER', permissions: id === 'admin' ? [] : memberPermissions });
    const prisma = {
      $transaction: async (callback: (tx: PrismaService) => Promise<unknown>) => callback(prisma as unknown as PrismaService),
      $queryRaw: async () => [],
      $executeRaw: async (_query: TemplateStringsArray, key: string) => { memberPermissions = memberPermissions.filter((permission) => permission !== key); return 1; },
      user: { findUnique: async ({ where }: { where: { id: string } }) => account(where.id) },
      sidebarItem: {
        delete: async ({ where }: { where: { key: string } }) => { const index = items.findIndex((item) => item.key === where.key); const deleted = items.splice(index, 1)[0]; items = items.filter((item) => item.parentKey !== where.key); return deleted; },
        findMany: async (args?: { where?: { parentKey?: string } }) => args?.where?.parentKey ? items.filter((item) => item.parentKey === args.where!.parentKey) : [...items],
        findUnique: async ({ where }: { where: { key?: string; href?: string } }) => items.find((item) => where.key ? item.key === where.key : item.href === where.href) ?? null,
        aggregate: async () => ({ _max: { sortOrder: 0, embedUrl: null, parentKey: null, createdById: null } }),
        create: async ({ data }: { data: SidebarItem }) => { items.push(data); return { ...data }; },
        update: async ({ where, data }: { where: { key: string }; data: Partial<SidebarItem> }) => {
          const item = items.find((candidate) => candidate.key === where.key)!;
          Object.assign(item, data);
          return { ...item };
        },
      },
    };
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: process.env.JWT_SECRET ?? 'eugestor-dev-secret-change-me' })],
      controllers: [NavigationController],
      providers: [NavigationService, JwtStrategy, JwtAuthGuard, AdminGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: { findById: account } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = app.get(JwtService);
  });
  afterEach(async () => { await app.close(); });
  const token = (id: string) => jwt.sign({ sub: id, email: `${id}@gmail.com` });

  it('rejects anonymous reads and non-admin changes', async () => {
    await request(app.getHttpServer()).get('/navigation').expect(401);
    await request(app.getHttpServer()).post('/navigation').auth(token('member'), { type: 'bearer' }).send({ label: 'Financeiro' }).expect(403);
    await request(app.getHttpServer()).patch('/navigation/inicio').auth(token('member'), { type: 'bearer' }).send({ label: 'Novo nome' }).expect(403);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Início');
  });

  it('creates and renames internal pages without accepting route or section overrides', async () => {
    const created = await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' })
      .send({ label: '  Financeiro  ', href: 'https://other.invalid', section: 'admin' }).expect(201);
    expect(created.body.label).toBe('Financeiro');
    expect(created.body.section).toBe('main');
    expect(created.body.href).toBe('/items/financeiro');
    await request(app.getHttpServer()).patch(`/navigation/${created.body.key}`).auth(token('admin'), { type: 'bearer' }).send({ label: 'Contas a pagar' }).expect(200);
    const loaded = await request(app.getHttpServer()).get(`/navigation/${created.body.key}`).auth(token('admin'), { type: 'bearer' }).expect(200);
    expect(loaded.body.label).toBe('Contas a pagar');
    expect(loaded.body.href).toBe('/items/contas-a-pagar');
  });

  it('only exposes the page to a regular user after granting its permission', async () => {
    const created = await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Financeiro' }).expect(201);
    await request(app.getHttpServer()).get(`/navigation/${created.body.key}`).auth(token('member'), { type: 'bearer' }).expect(403);
    const blocked = await request(app.getHttpServer()).get('/navigation').auth(token('member'), { type: 'bearer' }).expect(200);
    expect(blocked.body).toEqual([]);
    memberPermissions = [created.body.key];
    await request(app.getHttpServer()).get(`/navigation/${created.body.key}`).auth(token('member'), { type: 'bearer' }).expect(200);
    const allowed = await request(app.getHttpServer()).get('/navigation').auth(token('member'), { type: 'bearer' }).expect(200);
    expect(allowed.body.map((item: SidebarItem) => item.key)).toEqual([created.body.key]);
  });

  it('rejects empty labels and unknown entries', async () => {
    await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: ' ' }).expect(400);
    await request(app.getHttpServer()).patch('/navigation/unknown').auth(token('admin'), { type: 'bearer' }).send({ label: 'Nome' }).expect(404);
    expect(items).toHaveLength(1);
  });
  it('validates iframe URLs and resolves readable routes with permissions', async () => {
    for (const embedUrl of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.com']) {
      await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Relatório', embedUrl }).expect(400);
    }
    const created = await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Relatório mensal', embedUrl: 'https://example.com/report' }).expect(201);
    expect(created.body.href).toBe('/items/relatorio-mensal');
    await request(app.getHttpServer()).get('/navigation/relatorio-mensal').auth(token('member'), { type: 'bearer' }).expect(403);
    memberPermissions = [created.body.key];
    const page = await request(app.getHttpServer()).get('/navigation/relatorio-mensal').auth(token('member'), { type: 'bearer' }).expect(200);
    expect(page.body.embedUrl).toBe('https://example.com/report');
  });
  it('only allows admins to delete custom items and removes their permission', async () => {
    const created = await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Temporário' }).expect(201);
    memberPermissions = [created.body.key, 'inicio'];
    await request(app.getHttpServer()).delete(`/navigation/${created.body.key}`).expect(401);
    await request(app.getHttpServer()).delete(`/navigation/${created.body.key}`).auth(token('member'), { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).delete('/navigation/inicio').auth(token('admin'), { type: 'bearer' }).expect(403);
    items.push({ key: 'controle_acesso', label: 'Controle de Acesso', href: '/access-control', section: 'admin', sortOrder: 0, embedUrl: null, parentKey: null, createdById: null });
    await request(app.getHttpServer()).delete('/navigation/controle_acesso').auth(token('admin'), { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).delete(`/navigation/${created.body.key}`).auth(token('admin'), { type: 'bearer' }).expect(200);
    expect(memberPermissions).toEqual(['inicio']);
    expect(items.some((item) => item.key === created.body.key)).toBe(false);
    await request(app.getHttpServer()).get('/navigation/temporario').auth(token('admin'), { type: 'bearer' }).expect(404);
    await request(app.getHttpServer()).delete(`/navigation/${created.body.key}`).auth(token('admin'), { type: 'bearer' }).expect(404);
  });
  it('creates subitems with independent access and keeps their parent visible', async () => {
    const parent = await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Inteligência Artificial', subItems: [{ label: 'OpenWebIA', embedUrl: 'https://example.com/chat' }, { label: 'MCP RAG' }] }).expect(201);
    const children = items.filter((item) => item.parentKey === parent.body.key);
    expect(children).toHaveLength(2);
    expect(children[0].embedUrl).toBe('https://example.com/chat');
    memberPermissions = [children[0].key];
    const menu = await request(app.getHttpServer()).get('/navigation').auth(token('member'), { type: 'bearer' }).expect(200);
    expect(menu.body.map((item: SidebarItem) => item.key)).toEqual([parent.body.key, children[0].key]);
    expect(menu.body.find((item: SidebarItem) => item.key === parent.body.key).href).toBeNull();
    await request(app.getHttpServer()).get(`/navigation/${parent.body.key}`).auth(token('member'), { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get(`/navigation/${children[0].key}`).auth(token('member'), { type: 'bearer' }).expect(200);
    await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Terceiro nível', parentKey: children[0].key }).expect(400);
    const extra = await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Novo subitem', parentKey: parent.body.key }).expect(201);
    expect(extra.body.parentKey).toBe(parent.body.key);
    await request(app.getHttpServer()).delete(`/navigation/${parent.body.key}`).auth(token('admin'), { type: 'bearer' }).expect(200);
    expect(items.some((item) => item.parentKey === parent.body.key)).toBe(false);
    expect(memberPermissions).toEqual([]);
  });
  it('rejects invalid child labels, URLs and administrative parents', async () => {
    await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Grupo', subItems: [{ label: 'x' }] }).expect(400);
    await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Grupo', subItems: [{ label: 'Filho', embedUrl: 'javascript:alert(1)' }] }).expect(400);
    await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Filho', parentKey: 'inicio' }).expect(400);
    expect(items).toHaveLength(1);
  });
  it('records the authenticated creator and denies deletion by another admin', async () => {
    const created = await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Meu item', createdById: 'admin-other' }).expect(201);
    expect(created.body.createdById).toBe('admin');
    await request(app.getHttpServer()).delete(`/navigation/${created.body.key}`).auth(token('admin-other'), { type: 'bearer' }).expect(403);
    expect(items.some((item) => item.key === created.body.key)).toBe(true);
    await request(app.getHttpServer()).delete(`/navigation/${created.body.key}`).auth(token('admin'), { type: 'bearer' }).expect(200);
  });
  it('does not delete another creator’s child through its parent', async () => {
    const parent = await request(app.getHttpServer()).post('/navigation').auth(token('admin'), { type: 'bearer' }).send({ label: 'Meu grupo' }).expect(201);
    const child = await request(app.getHttpServer()).post('/navigation').auth(token('admin-other'), { type: 'bearer' }).send({ label: 'Filho de outro admin', parentKey: parent.body.key }).expect(201);
    memberPermissions = [child.body.key];
    await request(app.getHttpServer()).delete(`/navigation/${parent.body.key}`).auth(token('admin'), { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).delete(`/navigation/${child.body.key}`).auth(token('admin'), { type: 'bearer' }).expect(403);
    expect(memberPermissions).toEqual([child.body.key]);
    await request(app.getHttpServer()).delete(`/navigation/${child.body.key}`).auth(token('admin-other'), { type: 'bearer' }).expect(200);
    await request(app.getHttpServer()).delete(`/navigation/${parent.body.key}`).auth(token('admin'), { type: 'bearer' }).expect(200);
  });
  it('keeps historical items without recorded ownership protected', async () => {
    items.push({ key: 'legacy', label: 'Antigo', href: '/items/antigo', section: 'main', sortOrder: 1, parentKey: null, embedUrl: null, createdById: null });
    await request(app.getHttpServer()).delete('/navigation/legacy').auth(token('admin'), { type: 'bearer' }).expect(403);
  });
});
