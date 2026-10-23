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

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly presence: PresenceService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  permissionsCatalog() {
    return this.prisma.sidebarItem.findMany({ where: { href: { not: null } }, select: { key: true, label: true }, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] });
  }

  private async validatePermissions(permissions: string[]) {
    const extra = permissions.filter((key) => !PERMISSIONS.some((permission) => permission.key === key));
    if (!extra.length) return;
    const known = await this.prisma.sidebarItem.findMany({ where: { key: { in: extra }, href: { not: null } }, select: { key: true } });
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
