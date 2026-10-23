import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export type Presence = 'online' | 'away' | 'offline';

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  readonly events = new EventEmitter();
  private readonly sessions = new Map<string, { userId: string; lastActivity: number; visible: boolean }>();
  private readonly published = new Map<string, Presence>();
  private timer: ReturnType<typeof setInterval>;

  onModuleInit() {
    this.timer = setInterval(() => {
      for (const userId of new Set([...this.sessions.values()].map((session) => session.userId))) this.publish(userId);
    }, 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
    this.events.removeAllListeners();
    this.sessions.clear();
    this.published.clear();
  }

  connect(socketId: string, userId: string, visible: boolean, idle = false) {
    this.sessions.set(socketId, { userId, lastActivity: Date.now() - (idle ? 300_000 : 0), visible });
    this.publish(userId);
  }

  activity(socketId: string, visible: boolean) {
    const session = this.sessions.get(socketId);
    if (!session) return;
    if (visible || (session.visible && Date.now() - session.lastActivity < 300_000)) session.lastActivity = Date.now();
    session.visible = visible;
    this.publish(session.userId);
  }

  disconnect(socketId: string) {
    const session = this.sessions.get(socketId);
    if (!session) return;
    this.sessions.delete(socketId);
    this.publish(session.userId);
  }

  get(userId: string): Presence {
    const sessions = [...this.sessions.values()].filter((session) => session.userId === userId);
    if (!sessions.length) return 'offline';
    return sessions.some((session) => Date.now() - session.lastActivity < 5 * 60 * 1000) ? 'online' : 'away';
  }

  snapshot(): { id: string; presence: Presence }[] {
    return [...new Set([...this.sessions.values()].map((session) => session.userId))].map((id) => ({ id, presence: this.get(id) }));
  }

  roleChanged(id: string, role: string) { this.events.emit('role', { id, role }); }

  private publish(id: string) {
    const presence = this.get(id);
    if ((this.published.get(id) ?? 'offline') === presence) return;
    if (presence === 'offline') this.published.delete(id);
    else this.published.set(id, presence);
    this.events.emit('change', { id, presence });
  }
}
