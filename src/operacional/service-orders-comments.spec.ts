import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ServiceOrdersService } from './service-orders.service.js';

function setup(events: Record<string, unknown>[] = []) {
  const order = { id: 'os-1', number: 119, status: 4, technicians: [], sellers: [], quoteNumbers: [], detail: { eventos: events } };
  const users = [{ id: 'ana', name: 'Ana Maria', avatarUrl: null }, { id: 'admin', name: 'Administrador', avatarUrl: null }];
  const prisma = {
    serviceOrder: { findUnique: vi.fn().mockResolvedValue(order), update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...order, ...data })) },
    user: { findMany: vi.fn().mockImplementation(({ where }) => Promise.resolve(where.role ? [users[1]] : where.id ? users.filter((u) => where.id.in.includes(u.id)) : users)) },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
  const ops = { notifyAdmins: vi.fn(), record: vi.fn().mockResolvedValue(undefined) };
  const service = new ServiceOrdersService(prisma as unknown as ConstructorParameters<typeof ServiceOrdersService>[0], {} as ConstructorParameters<typeof ServiceOrdersService>[1], ops as unknown as ConstructorParameters<typeof ServiceOrdersService>[2]);
  return { service, prisma };
}

describe('Respostas e menções nos comentários da OS', () => {
  const original = { id: 'original', usuario: 'João', usuarioId: 'joao', conteudo: 'Instalação concluída', dataRegistro: '2026-10-29T12:00:00.000Z' };

  it('persiste a citação original e as menções, sem duplicar a notificação do administrador', async () => {
    const { service, prisma } = setup([original]);
    const input = { text: '@Ana Maria @Administrador confira', replyToKey: 'original', mentionIds: ['ana', 'admin', 'admin'] };
    const result = await service.comment({ id: 'autor', name: 'Autor' }, 'os-1', input);
    expect(result.events.at(-1)).toMatchObject({
      replyTo: { key: 'original', usuario: 'João', conteudo: 'Instalação concluída' },
      mentions: [{ id: 'ana', name: 'Ana Maria' }, { id: 'admin', name: 'Administrador' }],
    });
    const notifications = prisma.notification.createMany.mock.calls[0][0].data as { userId: string }[];
    expect(notifications.map((n) => n.userId).sort()).toEqual(['admin', 'ana']);
  });

  it('permite responder comentários importados que não possuem id', async () => {
    const { id: _id, ...legacy } = original;
    const { service } = setup([legacy]);
    const key = `legacy:${legacy.dataRegistro}:${legacy.usuario}`;
    const input = { text: 'Confirmado', replyToKey: key };
    const result = await service.comment({ id: 'autor', name: 'Autor' }, 'os-1', input);
    expect(result.events.at(-1)).toMatchObject({ replyTo: { key, usuario: 'João' } });
  });

  it('rejeita uma resposta a comentário inexistente ou de outra OS antes de gravar', async () => {
    const { service, prisma } = setup();
    const input = { text: 'Resposta', replyToKey: 'outra-os' };
    await expect(service.comment({ id: 'autor', name: 'Autor' }, 'os-1', input)).rejects.toThrow('Comentário original não encontrado');
    expect(prisma.serviceOrder.update).not.toHaveBeenCalled();
  });

  it('não notifica menção removida do texto antes do envio', async () => {
    const { service, prisma } = setup();
    const input = { text: 'Sem menção', mentionIds: ['ana'] };
    const result = await service.comment({ id: 'autor', name: 'Autor' }, 'os-1', input);
    expect(result.events.at(-1)).toMatchObject({ mentions: [] });
    const notifications = prisma.notification.createMany.mock.calls[0][0].data as { userId: string }[];
    expect(notifications.map((n) => n.userId)).toEqual(['admin']);
  });

  it('ignora um usuário inexistente ou inativo e não notifica o autor por mencionar a si próprio', async () => {
    const { service, prisma } = setup();
    const input = { text: '@Ana Maria @Inativo', mentionIds: ['ana', 'inativo'] };
    const result = await service.comment({ id: 'ana', name: 'Ana Maria' }, 'os-1', input);
    expect(result.events.at(-1)).toMatchObject({ mentions: [{ id: 'ana', name: 'Ana Maria' }] });
    const notifications = prisma.notification.createMany.mock.calls[0][0].data as { userId: string }[];
    expect(notifications.map((n) => n.userId)).toEqual(['admin']);
  });
});
