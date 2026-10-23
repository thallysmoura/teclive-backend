import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { UsersModule } from '../users/users.module.js';
import { PresenceModule } from '../presence/presence.module.js';

@Module({
  imports: [
    UsersModule,
    PresenceModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'eugestor-dev-secret-change-me',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshTokenService],
})
export class AuthModule {}
