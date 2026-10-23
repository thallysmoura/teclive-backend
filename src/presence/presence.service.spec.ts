import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresenceService } from './presence.service.js';

describe('live presence', () => {
  let presence: PresenceService;
  beforeEach(() => {
    vi.useFakeTimers();
    presence = new PresenceService();
    presence.onModuleInit();
  });
  afterEach(() => { presence.onModuleDestroy(); vi.useRealTimers(); });

  it('publishes online immediately when a session connects', () => {
    const changes: unknown[] = [];
    presence.events.on('change', (change) => changes.push(change));
    presence.connect('tab1', 'ana', true);
    expect(presence.get('ana')).toBe('online');
    expect(changes).toEqual([{ id: 'ana', presence: 'online' }]);
  });

  it('becomes away after exactly five minutes without activity', () => {
    presence.connect('tab1', 'ana', true);
    vi.advanceTimersByTime(299_999);
    expect(presence.get('ana')).toBe('online');
    vi.advanceTimersByTime(1);
    expect(presence.get('ana')).toBe('away');
    presence.activity('tab1', true);
    expect(presence.get('ana')).toBe('online');
  });

  it('keeps a hidden page away even if background activity messages arrive', () => {
    presence.connect('tab1', 'ana', true);
    presence.activity('tab1', false);
    vi.advanceTimersByTime(240_000);
    presence.activity('tab1', false);
    vi.advanceTimersByTime(60_000);
    expect(presence.get('ana')).toBe('away');
  });

  it('keeps the user online while any other tab is active', () => {
    presence.connect('tab1', 'ana', true);
    presence.connect('tab2', 'ana', true);
    vi.advanceTimersByTime(240_000);
    presence.activity('tab2', true);
    vi.advanceTimersByTime(60_000);
    expect(presence.get('ana')).toBe('online');
    presence.disconnect('tab1');
    expect(presence.get('ana')).toBe('online');
    presence.disconnect('tab2');
    expect(presence.get('ana')).toBe('offline');
  });

  it('does not restore an idle user to online when their window loses focus', () => {
    presence.connect('tab1', 'ana', true);
    vi.advanceTimersByTime(300_000);
    presence.activity('tab1', false);
    expect(presence.get('ana')).toBe('away');
  });

  it('preserves an already idle state when reconnecting', () => {
    presence.connect('tab1', 'ana', false, true);
    expect(presence.get('ana')).toBe('away');
  });

  it('broadcasts offline immediately after the last connection closes', () => {
    const changes: unknown[] = [];
    presence.events.on('change', (change) => changes.push(change));
    presence.connect('tab1', 'ana', true);
    presence.disconnect('tab1');
    expect(changes.at(-1)).toEqual({ id: 'ana', presence: 'offline' });
    expect(presence.snapshot()).toEqual([]);
  });

  it('only publishes state changes, not repeated activity', () => {
    const changes: unknown[] = [];
    presence.events.on('change', (change) => changes.push(change));
    presence.connect('tab1', 'ana', true);
    presence.activity('tab1', true);
    presence.activity('tab1', true);
    expect(changes).toHaveLength(1);
  });
});
