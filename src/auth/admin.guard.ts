import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const payload = req.user as { id: string } | undefined;
    if (!payload) return false;

    const user = await this.usersService.findById(payload.id);
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas administradores podem acessar este recurso.');
    }

    return true;
  }
}
