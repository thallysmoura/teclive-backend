import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PresenceGateway } from './presence.gateway.js';
import { PresenceService } from './presence.service.js';

type Update = { id: string; presence: string; lastDevice?: string };

describe('presence WebSocket integration', () => {
  let app: INestApplication;
  let url: string;
  let gateway: PresenceGateway;
  const clients: Socket[] = [];
  const jwt = new JwtService({ secret: 'presence-integration-test' });
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:4300';
  const users = [
    { id: 'admin', role: 'ADMIN', lastLoginAt: new Date('2026-10-23T15:00:00Z'), lastDevice: 'desktop', lastSeenAt: new Date() },
    { id: 'member', role: 'USER', lastLoginAt: new Date('2026-10-23T15:01:00Z'), lastDevice: 'mobile', lastSeenAt: new Date() },
  ];

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PresenceGateway, PresenceService,
        { provide: JwtService, useValue: jwt },
        { provide: PrismaService, useValue: { user: {
          findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.find((user) => user.id === where.id)),
          findMany: vi.fn(async ({ where }: { where: { id?: string } }) => users.filter((user) => !where.id || user.id === where.id)),
          update: vi.fn(async () => ({})),
        } } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/presence`;
    gateway = app.get(PresenceGateway);
  });

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.disconnect());
    await app.close();
  });

  function client(token?: string, requestedOrigin = origin, idle = false) {
    const socket = io(url, {
      autoConnect: false, transports: ['websocket'], reconnection: false,
      extraHeaders: { Origin: requestedOrigin, ...(token ? { Cookie: `eugestor_token=${token}` } : {}) },
      auth: { visible: true, idle },
    });
    clients.push(socket);
    return socket;
  }

  function event<T>(socket: Socket, name: string, matches: (value: T) => boolean = () => true): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.off(name, handler); reject(new Error(`Missing ${name}`)); }, 3000);
      function handler(value: T) {
        if (!matches(value)) return;
        clearTimeout(timer);
        socket.off(name, handler);
        resolve(value);
      }
      socket.on(name, handler);
    });
  }

  async function connect(id: string, idle = false) {
    const token = jwt.sign({ sub: id, nonce: randomUUID() }, { expiresIn: '1m' });
    const socket = client(token, origin, idle);
    const initial = event<Update[]>(socket, 'presence:snapshot');
    socket.connect();
    return { socket, token, snapshot: await initial };
  }

  it('rejects anonymous connections and connections from a different origin', async () => {
    for (const socket of [client(), client(jwt.sign({ sub: 'admin' }, { expiresIn: '1m' }), 'https://other.invalid')]) {
      const error = event<Error & { data: { code: string } }>(socket, 'connect_error');
      socket.connect();
      expect((await error).data.code).toBe('UNAUTHORIZED');
      expect(socket.connected).toBe(false);
    }
  });

  it('restricts non-admin snapshots to their own account', async () => {
    const member = await connect('member');
    expect(member.snapshot.map((user) => user.id)).toEqual(['member']);
  });

  it('pushes online, away, activity recovery and offline to another connected client', async () => {
    const admin = await connect('admin');
    const away = event<Update>(admin.socket, 'presence:update', (update) => update.id === 'member' && update.presence === 'away');
    const member = await connect('member', true);
    expect((await away).presence).toBe('away');
    const online = event<Update>(admin.socket, 'presence:update', (update) => update.id === 'member' && update.presence === 'online');
    member.socket.emit('presence:activity', { visible: true });
    expect((await online).presence).toBe('online');
    const offline = event<Update>(admin.socket, 'presence:update', (update) => update.id === 'member' && update.presence === 'offline');
    member.socket.disconnect();
    expect((await offline).presence).toBe('offline');
  });

  it('synchronizes logout across tabs while preserving another device session', async () => {
    const first = await connect('member');
    const sameSession = client(first.token);
    const initial = event<Update[]>(sameSession, 'presence:snapshot');
    sameSession.connect();
    await initial;
    const anotherDevice = await connect('member');
    const logout1 = event(first.socket, 'presence:logout');
    const logout2 = event(sameSession, 'presence:logout');
    gateway.disconnectSession(first.token);
    await Promise.all([logout1, logout2]);
    expect(anotherDevice.socket.connected).toBe(true);
    expect(app.get(PresenceService).get('member')).toBe('online');
  });
});
