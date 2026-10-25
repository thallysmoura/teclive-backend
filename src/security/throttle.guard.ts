import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limite de requisições por IP (atrás do Cloudflare o IP real vem em CF-Connecting-IP).
 * No login o contador também considera o e-mail tentado, para travar ataques de senha sem bloquear a empresa inteira.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const header = (name: string) => { const v = req.headers?.[name]; return Array.isArray(v) ? v[0] : v; };
    const ip = header('cf-connecting-ip') || String(header('x-forwarded-for') ?? '').split(',')[0].trim() || req.ip || 'unknown';
    const email = typeof req.body?.email === 'string' && String(req.originalUrl ?? req.url).includes('/auth/login') ? `:${req.body.email.toLowerCase().slice(0, 120)}` : '';
    return `${ip}${email}`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true; // WebSocket (presença) fica fora; a conexão já exige sessão válida
    return super.canActivate(context);
  }
}
