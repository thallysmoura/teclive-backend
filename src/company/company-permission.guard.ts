import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class CompanyPermissionGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const payload = context.switchToHttp().getRequest<Request>().user as { id: string } | undefined;
    const user = payload ? await this.users.findById(payload.id) : null;
    if (!user || (user.role !== 'ADMIN' && !user.permissions.includes('dados_empresa'))) throw new ForbiddenException('Você não tem permissão para consultar os dados da empresa.');
    return true;
  }
}
