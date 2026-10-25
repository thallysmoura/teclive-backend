import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { R2Service } from './r2.service.js';

/** Plano gratuito do Cloudflare R2 (por mês) e preços acima dele, em dólar. */
const FREE = { storageGb: 10, classA: 1_000_000, classB: 10_000_000 };
const PRICE = { storageGbMonth: 0.015, classAPerMillion: 4.5, classBPerMillion: 0.36 };
const GB = 1024 ** 3;
const LABELS: Record<string, string> = { avatars: 'Fotos de perfil', suggestions: 'Capturas das sugestões', 'os-files': 'Fotos das ordens de serviço' };

let cache: { at: number; value: unknown } | null = null;

@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly prisma: PrismaService, private readonly r2: R2Service) {}

  /** Uso e custo do R2 (só administradores): arquivos, armazenamento versus plano gratuito e custo estimado. */
  @Get('usage')
  async usage(@Req() req: Request) {
    const me = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { role: true } });
    if (me?.role !== 'ADMIN') throw new ForbiddenException('Apenas administradores veem o custo do armazenamento.');
    if (cache && Date.now() - cache.at < 5 * 60_000) return cache.value; // a listagem também é uma operação cobrada: guarda por 5 min
    const objects = await this.r2.list();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const bytes = objects.reduce((s, o) => s + o.size, 0);
    const byFolder = new Map<string, { files: number; bytes: number }>();
    for (const o of objects) {
      const folder = o.key.split('/')[0] || 'outros';
      const cur = byFolder.get(folder) ?? { files: 0, bytes: 0 };
      cur.files += 1; cur.bytes += o.size; byFolder.set(folder, cur);
    }
    const today = objects.filter((o) => o.modified >= startOfDay);
    const month = objects.filter((o) => o.modified >= startOfMonth);
    // Estimativa: cada envio é 1 operação "Classe A"; leituras públicas passam pelo CDN e não são medidas aqui (o plano gratuito tem 10 milhões).
    const storageGb = bytes / GB;
    const overGb = Math.max(0, storageGb - FREE.storageGb);
    const monthlyStorageUsd = overGb * PRICE.storageGbMonth;
    const classAUsd = (Math.max(0, month.length - FREE.classA) / 1_000_000) * PRICE.classAPerMillion;
    const monthlyUsd = monthlyStorageUsd + classAUsd;
    const value = {
      configured: true,
      files: objects.length,
      bytes,
      storageGb,
      freeGb: FREE.storageGb,
      percentOfFree: Math.min(100, (storageGb / FREE.storageGb) * 100),
      remainingBytes: Math.max(0, FREE.storageGb * GB - bytes),
      filesToday: today.length,
      bytesToday: today.reduce((s, o) => s + o.size, 0),
      filesMonth: month.length,
      avgBytes: objects.length ? Math.round(bytes / objects.length) : 0,
      // quantos arquivos do tamanho médio ainda cabem no plano gratuito
      filesUntilFull: objects.length && bytes ? Math.max(0, Math.floor((FREE.storageGb * GB - bytes) / (bytes / objects.length))) : null,
      classA: { used: month.length, free: FREE.classA },
      costUsd: { today: monthlyUsd / 30, month: monthlyUsd, storage: monthlyStorageUsd, operations: classAUsd },
      folders: [...byFolder.entries()].map(([key, v]) => ({ key, label: LABELS[key] ?? key, ...v })).sort((a, b) => b.bytes - a.bytes),
      generatedAt: now.toISOString(),
    };
    cache = { at: Date.now(), value };
    return value;
  }
}
