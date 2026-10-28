import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Pastas de anexos da OS: os administradores criam, nomeiam e organizam; todos veem. */
@Controller('service-orders/:id/folders')
@UseGuards(JwtAuthGuard)
export class OsFoldersController {
  constructor(private readonly prisma: PrismaService) {}

  private async admin(req: Request) {
    const u = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { name: true, role: true } });
    if (!u || u.role !== 'ADMIN') throw new ForbiddenException('Somente administradores organizam as pastas.');
    return u;
  }

  private async order(id: string) {
    if (!(await this.prisma.serviceOrder.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('OS não encontrada.');
  }

  private name(v: unknown) {
    const n = String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!n) throw new BadRequestException('Dê um nome para a pasta.');
    return n;
  }

  @Get()
  async list(@Param('id') id: string) {
    await this.order(id);
    const [folders, items] = await Promise.all([
      this.prisma.osFolder.findMany({ where: { orderId: id }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }),
      this.prisma.osFolderItem.findMany({ where: { orderId: id }, select: { attachmentId: true, folderId: true } }),
    ]);
    return { folders, assign: Object.fromEntries(items.map((i) => [i.attachmentId, i.folderId])) };
  }

  @Post()
  async create(@Req() req: Request, @Param('id') id: string, @Body() b: { name?: string }) {
    const u = await this.admin(req);
    await this.order(id);
    return this.prisma.osFolder.create({ data: { orderId: id, name: this.name(b.name), createdBy: u.name }, select: { id: true, name: true } });
  }

  /** Move um anexo para uma pasta (ou de volta para "Sem pasta" quando folderId é nulo). */
  @Put('assign')
  async assign(@Req() req: Request, @Param('id') id: string, @Body() b: { attachmentId?: string | number; folderId?: string | null }) {
    await this.admin(req);
    const attachmentId = String(b.attachmentId ?? '');
    if (!attachmentId) throw new BadRequestException('Anexo inválido.');
    if (!b.folderId) { await this.prisma.osFolderItem.deleteMany({ where: { orderId: id, attachmentId } }); return { ok: true }; }
    const folder = await this.prisma.osFolder.findFirst({ where: { id: b.folderId, orderId: id }, select: { id: true } });
    if (!folder) throw new NotFoundException('Pasta não encontrada.');
    await this.prisma.osFolderItem.upsert({ where: { orderId_attachmentId: { orderId: id, attachmentId } }, create: { orderId: id, attachmentId, folderId: folder.id }, update: { folderId: folder.id } });
    return { ok: true };
  }

  @Put(':folderId')
  async rename(@Req() req: Request, @Param('id') id: string, @Param('folderId') folderId: string, @Body() b: { name?: string }) {
    await this.admin(req);
    const r = await this.prisma.osFolder.updateMany({ where: { id: folderId, orderId: id }, data: { name: this.name(b.name) } });
    if (!r.count) throw new NotFoundException('Pasta não encontrada.');
    return { ok: true };
  }

  @Delete(':folderId')
  async remove(@Req() req: Request, @Param('id') id: string, @Param('folderId') folderId: string) {
    await this.admin(req);
    const r = await this.prisma.osFolder.deleteMany({ where: { id: folderId, orderId: id } });
    if (!r.count) throw new NotFoundException('Pasta não encontrada.');
    return { ok: true };
  }
}
