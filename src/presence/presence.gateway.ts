import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, type OnGatewayConnection, type OnGatewayDisconnect, type OnGatewayInit } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import { PresenceService, type Presence } from './presence.service.js';

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:4300';

@WebSocketGateway({
  namespace: '/presence',
  transports: ['websocket'],
  cors: { origin: WEB_ORIGIN, credentials: true },
  maxHttpBufferSize: 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
})
export class PresenceGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private server: Namespace;
  private readonly logger = new Logger(PresenceGateway.name);
  private readonly expiry = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  /** Avisa os administradores conectados para atualizarem as notificações na hora. */
  notifyAdmins() {
    this.server?.to('admins').emit('notification:new');
  }

  /** Avisa pessoas específicas para atualizarem o sino de notificações na hora. */
  notifyUsers(ids: string[]) {
    for (const id of ids) this.server?.to(`user:${id}`).emit('notification:new');
  }

  /** Envia um evento operacional só a quem está com o Painel de Acompanhamento aberto. */
  emitOps(event: unknown) {
    this.server?.to('ops-panel').emit('ops:event', event);
  }

  @SubscribeMessage('ops:join')
  opsJoin(@ConnectedSocket() socket: Socket) { void socket.join('ops-panel'); }

  @SubscribeMessage('ops:leave')
  opsLeave(@ConnectedSocket() socket: Socket) { void socket.leave('ops-panel'); }

  private readonly broadcast = (change: { id: string; presence: Presence }) => {
    this.server.to('admins').to(`user:${change.id}`).emit('presence:update', change);
  };

  private readonly updateRole = ({ id, role }: { id: string; role: string }) => {
    for (const socket of this.server.sockets.values()) {
      if (socket.data.user.id !== id) continue;
      socket.data.user.role = role;
      if (role === 'ADMIN') void socket.join('admins');
      else void socket.leave('admins');
      void this.sendSnapshot(socket).catch(() => socket.disconnect(true));
    }
  };

  afterInit(server: Namespace) {
    this.server = server;
    server.use((socket, next) => {
      void this.authenticate(socket).then(() => next()).catch(() => {
        next(Object.assign(new Error('Sessão inválida.'), { data: { code: 'UNAUTHORIZED' } }));
      });
    });
    this.presence.events.on('change', this.broadcast);
    this.presence.events.on('role', this.updateRole);
  }

  private async authenticate(socket: Socket) {
    if (socket.handshake.headers.origin !== WEB_ORIGIN) throw new Error('Invalid origin');
    const raw = socket.handshake.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('eugestor_token='))?.slice('eugestor_token='.length);
    if (!raw) throw new Error('Missing session');
    const token = decodeURIComponent(raw);
    const payload = await this.jwt.verifyAsync<{ sub: string; exp: number }>(token);
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) throw new Error('Invalid token');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, lastLoginAt: true, lastDevice: true, lastSeenAt: true },
    });
    if (!user) throw new Error('Unknown user');
    socket.data.user = user;
    socket.data.token = token;
    socket.data.expiresAt = payload.exp * 1000;
    socket.data.lastPersistAt = Date.now();
  }

  async handleConnection(socket: Socket) {
    const user = socket.data.user;
    await socket.join(`user:${user.id}`);
    if (user.role === 'ADMIN') await socket.join('admins');
    if (!socket.connected) return;
    this.presence.connect(socket.id, user.id, socket.handshake.auth.visible === true, socket.handshake.auth.idle === true);
    this.server.to('admins').to(`user:${user.id}`).emit('presence:update', {
      id: user.id, presence: this.presence.get(user.id), lastLoginAt: user.lastLoginAt,
      lastDevice: user.lastDevice, lastSeenAt: user.lastSeenAt,
    });
    this.expiry.set(socket.id, setTimeout(() => {
      socket.emit('presence:expired');
      socket.disconnect(true);
    }, socket.data.expiresAt - Date.now()));
    void this.persistActivity(user.id);
    await this.sendSnapshot(socket).catch(() => socket.disconnect(true));
  }

  handleDisconnect(socket: Socket) {
    clearTimeout(this.expiry.get(socket.id));
    this.expiry.delete(socket.id);
    this.presence.disconnect(socket.id);
  }

  @SubscribeMessage('presence:activity')
  activity(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    if (!body || typeof body !== 'object' || !('visible' in body) || typeof body.visible !== 'boolean') return;
    if (socket.data.expiresAt <= Date.now()) { socket.disconnect(true); return; }
    this.presence.activity(socket.id, body.visible);
    if (body.visible && Date.now() - socket.data.lastPersistAt >= 60_000) {
      socket.data.lastPersistAt = Date.now();
      void this.persistActivity(socket.data.user.id);
    }
  }

  disconnectSession(token: string | undefined) {
    if (!token || !this.server) return;
    for (const socket of this.server.sockets.values()) {
      if (socket.data.token !== token) continue;
      socket.emit('presence:logout');
      socket.disconnect(true);
    }
  }

  private async sendSnapshot(socket: Socket) {
    const users = await this.prisma.user.findMany({
      where: socket.data.user.role === 'ADMIN' ? {} : { id: socket.data.user.id },
      select: { id: true, lastLoginAt: true, lastDevice: true, lastSeenAt: true },
    });
    if (!socket.connected) return;
    // A role may have changed while the database request was in flight.
    socket.emit('presence:snapshot', users.filter((user) => socket.data.user.role === 'ADMIN' || user.id === socket.data.user.id).map((user) => ({ ...user, presence: this.presence.get(user.id) })));
  }

  private async persistActivity(id: string) {
    try { await this.prisma.user.update({ where: { id }, data: { lastSeenAt: new Date() } }); }
    catch { this.logger.warn('Não foi possível registrar a atividade da sessão.'); }
  }

  onModuleDestroy() {
    for (const timer of this.expiry.values()) clearTimeout(timer);
    this.presence.events.off('change', this.broadcast);
    this.presence.events.off('role', this.updateRole);
  }
}
