import { BadRequestException, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

const OS_TYPES: Record<number, string> = { 1: 'Instalação', 2: 'Cancelamento', 3: 'Manutenção Corretiva', 4: 'Manutenção Preventiva' };
type Call = { atendimentoId: number; descricao?: string; dataHoraInicio?: string; dataHoraFim?: string | null; duracaoEmMinutos?: number | null; registro?: { nomeUsuario?: string } };
type Detail = { atendimentos?: Call[]; historico?: { dataHora: string; descricao: string; nomeUsuario: string; isLog: boolean }[] } & Record<string, unknown>;
const addr = (a: unknown) => { const x = (a ?? {}) as Record<string, string>; return [[x.logradouro, x.numero].filter(Boolean).join(', '), x.bairro, [x.cidade, x.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · '); };

/** Aplicativo de Gestão de OS (PWA do técnico): lista as OS do técnico e controla o atendimento. */
@Controller('app-os')
@UseGuards(JwtAuthGuard)
export class AppOsController {
  constructor(private readonly prisma: PrismaService) {}

  private async me(req: Request) {
    const u = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { id: true, name: true, role: true, appAccess: true } });
    if (!u) throw new BadRequestException('Sessão inválida.');
    if (!u.appAccess) throw new ForbiddenException('Seu e-mail não tem acesso ao aplicativo. Peça ao administrador.');
    return u;
  }

  /** Técnicos veem as OS atribuídas a eles; administradores com acesso ao app veem todas. */
  private mine(u: { name: string; role: string }): Prisma.ServiceOrderWhereInput {
    return u.role === 'ADMIN' ? {} : { technicians: { has: u.name } };
  }

  @Get('os')
  async list(@Req() req: Request, @Query() q: { tab?: string; q?: string }) {
    const u = await this.me(req);
    const term = q.q?.trim();
    const pending = q.tab !== 'history';
    const rows = await this.prisma.serviceOrder.findMany({
      where: { ...this.mine(u), status: pending ? { in: [0, 1, 3, 7, 8] } : { in: [2, 4, 5, 6] }, ...(term ? { OR: [{ personName: { contains: term, mode: 'insensitive' } }, { defectName: { contains: term, mode: 'insensitive' } }, ...(/^\d+$/.test(term) ? [{ number: Number(term) }] : [])] } : {}) },
      orderBy: pending ? [{ scheduleStart: 'asc' }, { number: 'asc' }] : [{ closedAt: 'desc' }, { number: 'desc' }], take: 150,
      select: { id: true, number: true, status: true, type: true, personName: true, personNickname: true, defectName: true, address: true, scheduleStart: true, openedAt: true, closedAt: true },
    });
    return rows.map((o) => ({ id: o.id, number: o.number, status: o.status, typeLabel: OS_TYPES[o.type] ?? '—', client: o.personNickname || o.personName, reason: o.defectName, address: addr(o.address), when: (pending ? o.scheduleStart ?? o.openedAt : o.closedAt ?? o.openedAt) }));
  }

  @Get('os/:id')
  async one(@Req() req: Request, @Param('id') id: string) {
    const u = await this.me(req);
    const o = await this.prisma.serviceOrder.findFirst({ where: { id, ...this.mine(u) } });
    if (!o) throw new NotFoundException('OS não encontrada.');
    const d = (o.detail ?? {}) as Detail & { produtos?: { produto?: { descricao?: string }; quantidade?: number; valores?: { total?: number } }[]; servicos?: { servico?: { descricao?: string }; quantidade?: number; valores?: { total?: number } }[]; avisos?: unknown[]; contato?: { nome?: string; telefone?: string | null } };
    const contact = (o.contact ?? d.contato ?? {}) as { nome?: string; telefone?: string | null };
    const calls = d.atendimentos ?? [];
    return {
      id: o.id, number: o.number, status: o.status, typeLabel: OS_TYPES[o.type] ?? '—', reason: o.defectName, client: o.personNickname || o.personName,
      address: addr(o.address), coordinate: ((o.address ?? {}) as { coordenada?: { latitude?: number; longitude?: number } }).coordenada ?? null,
      contact: { name: contact.nome ?? null, phone: contact.telefone ?? null },
      notices: (d.avisos ?? []).map((a) => (typeof a === 'string' ? a : String((a as { descricao?: string; texto?: string }).descricao ?? (a as { texto?: string }).texto ?? ''))).filter(Boolean),
      products: (d.produtos ?? []).map((p) => ({ name: p.produto?.descricao ?? '—', qty: p.quantidade ?? 1 })),
      services: (d.servicos ?? []).map((s) => ({ name: s.servico?.descricao ?? '—', qty: s.quantidade ?? 1 })),
      calls: calls.length, openCall: calls.some((c) => !c.dataHoraFim && c.registro?.nomeUsuario === u.name),
      openedAt: o.openedAt, openedBy: o.openedBy, scheduleStart: o.scheduleStart, scheduleEnd: o.scheduleEnd,
    };
  }

  /** Inicia o atendimento: registra o horário, coloca a OS "Em Atendimento" e avisa no histórico. */
  @Post('os/:id/start')
  async start(@Req() req: Request, @Param('id') id: string) {
    const u = await this.me(req);
    const o = await this.prisma.serviceOrder.findFirst({ where: { id, ...this.mine(u) } });
    if (!o) throw new NotFoundException('OS não encontrada.');
    if (![0, 1, 8].includes(o.status)) throw new BadRequestException('Só é possível atender uma OS aberta.');
    const d = (o.detail ?? {}) as Detail;
    const calls = d.atendimentos ?? [];
    if (calls.some((c) => !c.dataHoraFim && c.registro?.nomeUsuario === u.name)) throw new BadRequestException('Você já tem um atendimento em andamento nesta OS.');
    const nextId = Math.max(0, ...calls.map((c) => c.atendimentoId ?? 0)) + 1;
    d.atendimentos = [...calls, { atendimentoId: nextId, descricao: 'Atendimento pelo aplicativo', dataHoraInicio: new Date().toISOString(), dataHoraFim: null, duracaoEmMinutos: null, registro: { nomeUsuario: u.name } }];
    d.historico = [{ dataHora: new Date().toISOString(), descricao: `Atendimento iniciado por '${u.name}' (aplicativo)`, nomeUsuario: u.name, isLog: true }, ...(d.historico ?? [])];
    await this.prisma.serviceOrder.update({ where: { id }, data: { status: 8, detail: d as Prisma.InputJsonValue } });
    return { ok: true };
  }

  @Post('os/:id/finish')
  async finish(@Req() req: Request, @Param('id') id: string) {
    const u = await this.me(req);
    const o = await this.prisma.serviceOrder.findFirst({ where: { id, ...this.mine(u) } });
    if (!o) throw new NotFoundException('OS não encontrada.');
    const d = (o.detail ?? {}) as Detail;
    const call = (d.atendimentos ?? []).find((c) => !c.dataHoraFim && c.registro?.nomeUsuario === u.name);
    if (!call) throw new BadRequestException('Nenhum atendimento em andamento para você nesta OS.');
    const end = new Date();
    call.dataHoraFim = end.toISOString();
    call.duracaoEmMinutos = Math.max(1, Math.round((end.getTime() - new Date(call.dataHoraInicio ?? end).getTime()) / 60000));
    d.historico = [{ dataHora: end.toISOString(), descricao: `Atendimento finalizado por '${u.name}' (${call.duracaoEmMinutos} min)`, nomeUsuario: u.name, isLog: true }, ...(d.historico ?? [])];
    const stillOpen = (d.atendimentos ?? []).some((c) => !c.dataHoraFim);
    await this.prisma.serviceOrder.update({ where: { id }, data: { status: stillOpen ? 8 : 0, detail: d as Prisma.InputJsonValue } });
    return { ok: true };
  }
}
