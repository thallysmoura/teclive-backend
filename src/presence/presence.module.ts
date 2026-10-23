import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PresenceGateway } from './presence.gateway.js';
import { PresenceService } from './presence.service.js';

@Module({
  imports: [PrismaModule, JwtModule.register({ secret: process.env.JWT_SECRET ?? 'eugestor-dev-secret-change-me' })],
  providers: [PresenceService, PresenceGateway],
  exports: [PresenceService, PresenceGateway],
})
export class PresenceModule {}
