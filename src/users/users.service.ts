import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Role } from '@prisma/client';
import { validateEmailDomain } from './email-domain.js';
import { PresenceService } from '../presence/presence.service.js';

export const PERMISSIONS = [
  { key: 'inicio', label: 'Início' },
  { key: 'controle_acesso', label: 'Controle de Acesso' },
] as const;

const SELECT_SAFE = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  permissions: true,
  avatarUrl: true,
  lastLoginAt: true,
  lastSeenAt: true,
  lastDevice: true,
  createdAt: true,
} as const;

function generatePassword() {
  return randomBytes(9).toString('base64url');
}

/** Telas só para administradores: não entram no catálogo de permissões nem podem ser concedidas. */
const ADMIN_ONLY_HREFS = ['/gestao-obras', '/sugestoes', '/custo-ia'];

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly presence: PresenceService) {}

  /**
   * Quem entra sem nenhuma permissão fica "aguardando": avisa os administradores (foto, nome e horário vão na notificação).
   * Devolve true quando criou aviso novo (não repete enquanto houver um não lido dessa mesma pessoa).
   */
  async notifyAccessRequest(userId: string): Promise<boolean> {
    const person = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, permissions: true, avatarUrl: true } });
    if (!person || person.role === 'ADMIN' || person.permissions.length > 0) return false;
    const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    if (!admins.length) return false;
    const open = await this.prisma.notification.findMany({
      where: { readAt: null, userId: { in: admins.map((a) => a.id) }, data: { path: ['userId'], equals: person.id } },
      select: { userId: true },
    });
    const already = new Set(open.map((n) => n.userId));
    const targets = admins.filter((a) => !already.has(a.id));
    if (!targets.length) return false;
    const at = new Date().toISOString();
    await this.prisma.notification.createMany({
      data: targets.map((a) => ({
        userId: a.id,
        title: 'Nova pessoa aguardando permissão',
        message: `${person.name} acessou o sistema e aguarda liberação de acesso.`,
        data: { type: 'access-request', userId: person.id, name: person.name, email: person.email, avatarUrl: person.avatarUrl, at, url: '/access-control' },
      })),
    });
    return true;
  }

  /** Troca o endereço da foto e apaga a anterior do R2 quando ninguém mais usa o mesmo arquivo. */
  async replaceAvatar(id: string, url: string | null, storage: { keyFromUrl(u: string | null | undefined): string | null; delete(k: string): Promise<void> }) {
    const previous = (await this.prisma.user.findUnique({ where: { id }, select: { avatarUrl: true } }))?.avatarUrl ?? null;
    await this.prisma.user.update({ where: { id }, data: { avatarUrl: url } });
    const key = previous && previous !== url ? storage.keyFromUrl(previous) : null;
    if (key && (await this.prisma.user.count({ where: { avatarUrl: previous } })) === 0) await storage.delete(key).catch(() => undefined);
    return url;
  }

  async setPassword(id: string, password: string) {
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  permissionsCatalog() {
    return this.prisma.sidebarItem.findMany({ where: { AND: [{ href: { not: null } }, { href: { notIn: ADMIN_ONLY_HREFS } }], key: { not: 'ajuda' } }, select: { key: true, label: true }, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] });
  }

  private async validatePermissions(permissions: string[]) {
    const extra = permissions.filter((key) => !PERMISSIONS.some((permission) => permission.key === key));
    if (!extra.length) return;
    const known = await this.prisma.sidebarItem.findMany({ where: { key: { in: extra }, AND: [{ href: { not: null } }, { href: { notIn: ADMIN_ONLY_HREFS } }] }, select: { key: true } });
    if (extra.some((key) => !known.some((item) => item.key === key))) throw new BadRequestException('Há permissões inválidas na seleção.');
  }

  async listAll() {
    const users = await this.prisma.user.findMany({
      select: SELECT_SAFE,
      orderBy: { createdAt: 'asc' },
    });

    return users.map((user) => ({ ...user, presence: this.presence.get(user.id) }));
  }

  async createWithGeneratedPassword(params: { email: string; name: string; permissions: string[] }) {
    const existing = await this.findByEmail(params.email);
    if (existing) {
      throw new ConflictException('Já existe um usuário com esse e-mail.');
    }

    await validateEmailDomain(params.email);
    await this.validatePermissions(params.permissions);

    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: params.email,
        name: params.name,
        passwordHash,
        permissions: params.permissions,
        status: 'ACTIVE',
      },
      select: SELECT_SAFE,
    });

    return { user, password };
  }

  async updatePermissions(id: string, permissions: string[]) {
    await this.validatePermissions(permissions);
    return this.prisma.user.update({
      where: { id },
      data: { permissions, status: 'ACTIVE' },
      select: SELECT_SAFE,
    });
  }

  async resetPassword(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
      if (!user) throw new NotFoundException('Usuário não encontrado.');
      const password = generatePassword();
      const passwordHash = await bcrypt.hash(password, 10);
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return { user, password };
    });
  }

  async updateProfile(id: string, data: { name: string; email: string }) {
    const current = await this.findById(id);
    if (!current) throw new NotFoundException('Usuário não encontrado.');
    if (data.email !== current.email) {
      const existing = await this.findByEmail(data.email);
      if (existing && existing.id !== id) throw new ConflictException('Já existe um usuário com esse e-mail.');
      await validateEmailDomain(data.email);
    }
    try {
      const user = await this.prisma.user.update({ where: { id }, data: { name: data.name, email: data.email }, select: SELECT_SAFE });
      return { ...user, presence: this.presence.get(id) };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') throw new ConflictException('Já existe um usuário com esse e-mail.');
      if (code === 'P2025') throw new NotFoundException('Usuário não encontrado.');
      throw error;
    }
  }

  async updateMyProfile(id: string, data: { name: string; phone?: string }) {
    const user = await this.prisma.user.update({ where: { id }, data: { name: data.name, phone: data.phone || null }, select: { ...SELECT_SAFE, phone: true } });
    return user;
  }

  async changePassword(id: string, currentPassword: string, newPassword: string) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new BadRequestException('A senha atual está incorreta.');
    if (currentPassword === newPassword) throw new BadRequestException('A nova senha deve ser diferente da atual.');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    return { ok: true };
  }

  async updateRole(id: string, role: Role) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: SELECT_SAFE,
    });
    this.presence.roleChanged(id, role);
    return user;
  }

  /** Chamado no login: registra quando e de qual tipo de dispositivo a pessoa entrou. */
  recordLogin(id: string, device: string) {
    const now = new Date();
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: now, lastSeenAt: now, lastDevice: device },
    });
  }

  /** Chamado a cada request autenticada (ex.: /auth/me) para estimar presença online. */
  touchLastSeen(id: string) {
    return this.prisma.user
      .update({ where: { id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }
}
