import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OpsService } from '../ops/ops.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { R2Service } from '../storage/r2.service.js';

type Detail = { historico?: { dataHora: string; descricao: string; nomeUsuario: string; isLog: boolean }[] } & Record<string, unknown>;

const KIND: Record<string, string> = { point: 'Ponto', ok: 'OK', x: 'Objeção' };

/** Gestão de Obras: plantas da OS (Cloudflare R2), pontos marcados na imagem e histórico por data. */
@Controller('service-orders/:id/plans')
@UseGuards(JwtAuthGuard)
export class WorkPlansController {
  constructor(private readonly prisma: PrismaService, private readonly storage: R2Service, private readonly ops: OpsService) {}

  private async me(req: Request) {
    const u = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { id: true, name: true, role: true } });
    if (!u) throw new ForbiddenException();
    return u;
  }

  private async order(id: string) {
    const o = await this.prisma.serviceOrder.findUnique({ where: { id }, select: { id: true, number: true, detail: true } });
    if (!o) throw new NotFoundException('OS não encontrada.');
    return o;
  }

  private fmt(n: number) { return `${String(Math.floor(n / 1000)).padStart(3, '0')}.${String(n % 1000).padStart(3, '0')}`; }

  /** Registra no Histórico da OS e avisa os administradores em tempo real. */
  private async announce(o: { id: string; number: number; detail: unknown }, user: { id: string; name: string }, text: string, title: string, message: string) {
    const d = ((o.detail ?? {}) as Detail);
    d.historico = [{ dataHora: new Date().toISOString(), descricao: text, nomeUsuario: user.name, isLog: true }, ...(d.historico ?? [])];
    await this.prisma.serviceOrder.update({ where: { id: o.id }, data: { detail: d as object } });
    const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    if (admins.length) {
      await this.prisma.notification.createMany({ data: admins.map((a) => ({ userId: a.id, title, message, data: { type: 'os-plan', serviceOrderId: o.id, url: `/operacional/ordens-servico?os=${o.id}` } })) });
      this.ops.notifyAdmins();
    }
  }

  @Get()
  async list(@Param('id') id: string) {
    await this.order(id);
    return this.prisma.workPlan.findMany({ where: { orderId: id }, orderBy: { createdAt: 'desc' }, include: { points: { orderBy: { number: 'asc' } }, strokes: { orderBy: { createdAt: 'asc' } }, checklists: { orderBy: { createdAt: 'asc' }, include: { items: { orderBy: { sortOrder: 'asc' } } } } } });
  }

  @Post()
  async upload(@Req() req: Request, @Param('id') id: string, @Body() b: { title?: string; fileName?: string; fileBase64?: string; mimeType?: string }) {
    const user = await this.me(req);
    const o = await this.order(id);
    const data = Buffer.from(b.fileBase64 ?? '', 'base64');
    if (!data.length) throw new BadRequestException('Arquivo vazio.');
    if (data.length > 3 * 1024 * 1024) throw new BadRequestException('A imagem deve ter no máximo 3 MB (ela é reduzida automaticamente antes do envio).');
    const isJpeg = data[0] === 0xff && data[1] === 0xd8;
    const isPng = data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const isWebp = data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!(isJpeg || isPng || isWebp)) throw new BadRequestException('Envie uma imagem JPG, PNG ou WEBP.');
    const ext = isJpeg ? 'jpg' : isPng ? 'png' : 'webp';
    const key = `plantas/${createHash('sha256').update(data).digest('hex')}.${ext}`;
    await this.storage.put(key, data, isJpeg ? 'image/jpeg' : isPng ? 'image/png' : 'image/webp');
    const title = String(b.title ?? b.fileName ?? 'Planta').trim().slice(0, 200) || 'Planta';
    const plan = await this.prisma.workPlan.create({ data: { orderId: id, title, fileUrl: this.storage.publicUrl(key), userId: user.id, userName: user.name } });
    await this.announce(o, user, `Planta '${title}' anexada em Gestão de Obras por '${user.name}'`, `Nova planta na OS ${this.fmt(o.number)}`, `${user.name} anexou a planta "${title}".`);
    return { ...plan, points: [], strokes: [], checklists: [] };
  }

  /** Dá nome à planta no histórico (ex.: Infraestrutura, Instalação). */
  @Put(':planId')
  async renamePlan(@Req() req: Request, @Param('id') id: string, @Param('planId') planId: string, @Body() b: { title?: string }) {
    const user = await this.me(req);
    const o = await this.order(id);
    const plan = await this.prisma.workPlan.findFirst({ where: { id: planId, orderId: id } });
    if (!plan) throw new NotFoundException('Planta não encontrada.');
    const title = String(b.title ?? '').trim().slice(0, 200);
    if (!title) throw new BadRequestException('Dê um nome para a planta.');
    await this.prisma.workPlan.update({ where: { id: planId }, data: { title } });
    await this.announce(o, user, `Planta '${plan.title}' renomeada para '${title}' por '${user.name}'`, `Planta renomeada na OS ${this.fmt(o.number)}`, `${user.name} renomeou a planta para "${title}".`);
    return { ok: true };
  }

  @Post(':planId/checklists')
  async addChecklist(@Req() req: Request, @Param('id') id: string, @Param('planId') planId: string, @Body() b: { title?: string; items?: string[] }) {
    const user = await this.me(req);
    const o = await this.order(id);
    const plan = await this.prisma.workPlan.findFirst({ where: { id: planId, orderId: id } });
    if (!plan) throw new NotFoundException('Planta não encontrada.');
    const title = String(b.title ?? '').trim().slice(0, 160);
    if (!title) throw new BadRequestException('Dê um nome para o checklist.');
    const items = (Array.isArray(b.items) ? b.items : []).map((t) => String(t).trim().slice(0, 300)).filter(Boolean).slice(0, 50);
    const c = await this.prisma.workChecklist.create({ data: { planId, title, userName: user.name, items: { create: items.map((text, i) => ({ text, sortOrder: i })) } }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    await this.announce(o, user, `Checklist '${title}' criado na planta '${plan.title}' por '${user.name}'`, `Novo checklist na OS ${this.fmt(o.number)}`, `${user.name} criou o checklist "${title}" na planta "${plan.title}".`);
    return c;
  }

  @Put(':planId/checklists/:cid')
  async renameChecklist(@Param('id') id: string, @Param('planId') planId: string, @Param('cid') cid: string, @Body() b: { title?: string }) {
    const title = String(b.title ?? '').trim().slice(0, 160);
    if (!title) throw new BadRequestException('Dê um nome para o checklist.');
    const r = await this.prisma.workChecklist.updateMany({ where: { id: cid, planId, plan: { orderId: id } }, data: { title } });
    if (!r.count) throw new NotFoundException('Checklist não encontrado.');
    return { ok: true };
  }

  @Delete(':planId/checklists/:cid')
  async removeChecklist(@Req() req: Request, @Param('id') id: string, @Param('planId') planId: string, @Param('cid') cid: string) {
    const user = await this.me(req);
    const c = await this.prisma.workChecklist.findFirst({ where: { id: cid, planId, plan: { orderId: id } } });
    if (!c) throw new NotFoundException('Checklist não encontrado.');
    if (user.role !== 'ADMIN' && c.userName !== user.name) throw new ForbiddenException('Você só pode excluir os seus checklists.');
    await this.prisma.workChecklist.delete({ where: { id: cid } });
    return { ok: true };
  }

  @Post(':planId/checklists/:cid/items')
  async addItem(@Param('id') id: string, @Param('planId') planId: string, @Param('cid') cid: string, @Body() b: { text?: string }) {
    const c = await this.prisma.workChecklist.findFirst({ where: { id: cid, planId, plan: { orderId: id } } });
    if (!c) throw new NotFoundException('Checklist não encontrado.');
    const text = String(b.text ?? '').trim().slice(0, 300);
    if (!text) throw new BadRequestException('Escreva o item.');
    const last = await this.prisma.workChecklistItem.aggregate({ where: { checklistId: cid }, _max: { sortOrder: true } });
    return this.prisma.workChecklistItem.create({ data: { checklistId: cid, text, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }

  @Put(':planId/checklists/:cid/items/:iid')
  async updateItem(@Req() req: Request, @Param('id') id: string, @Param('planId') planId: string, @Param('cid') cid: string, @Param('iid') iid: string, @Body() b: { text?: string; done?: boolean }) {
    const user = await this.me(req);
    const o = await this.order(id);
    const item = await this.prisma.workChecklistItem.findFirst({ where: { id: iid, checklistId: cid, checklist: { planId, plan: { orderId: id } } }, include: { checklist: { select: { title: true } } } });
    if (!item) throw new NotFoundException('Item não encontrado.');
    const data: { text?: string; done?: boolean; doneBy?: string | null; doneAt?: Date | null } = {};
    if (b.text !== undefined) { const t = String(b.text).trim().slice(0, 300); if (!t) throw new BadRequestException('Escreva o item.'); data.text = t; }
    if (typeof b.done === 'boolean') { data.done = b.done; data.doneBy = b.done ? user.name : null; data.doneAt = b.done ? new Date() : null; }
    const upd = await this.prisma.workChecklistItem.update({ where: { id: iid }, data });
    if (data.done) {
      const left = await this.prisma.workChecklistItem.count({ where: { checklistId: cid, done: false } });
      if (left === 0) await this.announce(o, user, `Checklist '${item.checklist.title}' concluído por '${user.name}'`, `Checklist concluído na OS ${this.fmt(o.number)}`, `${user.name} concluiu o checklist "${item.checklist.title}".`);
    }
    return upd;
  }

  @Delete(':planId/checklists/:cid/items/:iid')
  async removeItem(@Param('id') id: string, @Param('planId') planId: string, @Param('cid') cid: string, @Param('iid') iid: string) {
    const r = await this.prisma.workChecklistItem.deleteMany({ where: { id: iid, checklistId: cid, checklist: { planId, plan: { orderId: id } } } });
    if (!r.count) throw new NotFoundException('Item não encontrado.');
    return { ok: true };
  }

  @Post(':planId/points')
  async addPoint(@Req() req: Request, @Param('id') id: string, @Param('planId') planId: string, @Body() b: { x?: number; y?: number; description?: string; kind?: string; label?: string }) {
    const user = await this.me(req);
    const o = await this.order(id);
    const plan = await this.prisma.workPlan.findFirst({ where: { id: planId, orderId: id } });
    if (!plan) throw new NotFoundException('Planta não encontrada.');
    const label = String(b.label ?? '').trim().slice(0, 40) || null;
    const x = Number(b.x), y = Number(b.y), description = String(b.description ?? '').trim().slice(0, 1000);
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw new BadRequestException('Ponto fora da imagem.');
    if (!description) throw new BadRequestException('Descreva o ponto marcado.');
    const last = await this.prisma.workPoint.aggregate({ where: { planId }, _max: { number: true } });
    const point = await this.prisma.workPoint.create({ data: { planId, orderId: id, number: (last._max.number ?? 0) + 1, x, y, kind: ['ok', 'x'].includes(String(b.kind)) ? String(b.kind) : 'point', label: ['ok', 'x'].includes(String(b.kind)) ? null : label, description, userId: user.id, userName: user.name } });
    const snippet = description.length > 120 ? `${description.slice(0, 117)}...` : description;
    await this.announce(o, user, `${point.label ?? KIND[point.kind] ?? 'Ponto'} ${point.number} marcado na planta '${plan.title}' por '${user.name}': ${snippet}`, `Novo ponto na OS ${this.fmt(o.number)}`, `${user.name} marcou ${(KIND[point.kind] ?? 'Ponto').toLowerCase()} ${point.number} na planta "${plan.title}": ${snippet}`);
    return point;
  }

  @Post(':planId/strokes')
  async addStroke(@Req() req: Request, @Param('id') id: string, @Param('planId') planId: string, @Body() b: { color?: string; points?: number[][] }) {
    const user = await this.me(req);
    const o = await this.order(id);
    const plan = await this.prisma.workPlan.findFirst({ where: { id: planId, orderId: id } });
    if (!plan) throw new NotFoundException('Planta não encontrada.');
    const color = /^#[0-9a-fA-F]{6}$/.test(String(b.color)) ? String(b.color) : '#E11D48';
    const pts = (Array.isArray(b.points) ? b.points : []).slice(0, 800).filter((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && n >= 0 && n <= 1)).map((p) => [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000]);
    if (pts.length < 2) throw new BadRequestException('Rabisco vazio.');
    const stroke = await this.prisma.workStroke.create({ data: { planId, color, points: pts, userId: user.id, userName: user.name } });
    await this.announce(o, user, `Rabisco desenhado na planta '${plan.title}' por '${user.name}'`, `Novo rabisco na OS ${this.fmt(o.number)}`, `${user.name} desenhou na planta "${plan.title}".`);
    return stroke;
  }

  @Delete(':planId/strokes/:strokeId')
  async removeStroke(@Req() req: Request, @Param('id') id: string, @Param('planId') planId: string, @Param('strokeId') strokeId: string) {
    const user = await this.me(req);
    const st = await this.prisma.workStroke.findFirst({ where: { id: strokeId, planId, plan: { orderId: id } } });
    if (!st) throw new NotFoundException('Rabisco não encontrado.');
    if (user.role !== 'ADMIN' && st.userId !== user.id) throw new ForbiddenException('Você só pode desfazer os seus próprios rabiscos.');
    await this.prisma.workStroke.delete({ where: { id: strokeId } });
    return { ok: true };
  }

  @Put(':planId/points/:pointId')
  async updatePoint(@Req() req: Request, @Param('id') id: string, @Param('pointId') pointId: string, @Body() b: { description?: string; done?: boolean; x?: number; y?: number }) {
    const user = await this.me(req);
    const o = await this.order(id);
    const p = await this.prisma.workPoint.findFirst({ where: { id: pointId, orderId: id }, include: { plan: { select: { title: true } } } });
    if (!p) throw new NotFoundException('Ponto não encontrado.');
    if (user.role !== 'ADMIN' && p.userId !== user.id) throw new ForbiddenException('Você só pode alterar os seus próprios pontos.');
    const data: { description?: string; done?: boolean; x?: number; y?: number } = {};
    if (b.x !== undefined || b.y !== undefined) {
      const x = Number(b.x), y = Number(b.y);
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw new BadRequestException('Posição fora da imagem.');
      data.x = x; data.y = y;
    }
    if (b.description !== undefined) { const d = String(b.description).trim().slice(0, 1000); if (!d) throw new BadRequestException('Descreva o ponto.'); data.description = d; }
    if (typeof b.done === 'boolean') data.done = b.done;
    const upd = await this.prisma.workPoint.update({ where: { id: pointId }, data });
    if (data.done !== undefined && data.done !== p.done) await this.announce(o, user, `Ponto ${p.number} da planta '${p.plan.title}' ${data.done ? 'concluído' : 'reaberto'} por '${user.name}'`, `Ponto ${data.done ? 'concluído' : 'reaberto'} na OS ${this.fmt(o.number)}`, `${user.name} ${data.done ? 'concluiu' : 'reabriu'} o ponto ${p.number} da planta "${p.plan.title}".`);
    return upd;
  }

  @Delete(':planId/points/:pointId')
  async removePoint(@Req() req: Request, @Param('id') id: string, @Param('pointId') pointId: string) {
    const user = await this.me(req);
    const p = await this.prisma.workPoint.findFirst({ where: { id: pointId, orderId: id } });
    if (!p) throw new NotFoundException('Ponto não encontrado.');
    if (user.role !== 'ADMIN' && p.userId !== user.id) throw new ForbiddenException('Você só pode excluir os seus próprios pontos.');
    await this.prisma.workPoint.delete({ where: { id: pointId } });
    return { ok: true };
  }
}
