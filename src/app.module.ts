import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './security/throttle.guard.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { StockLocationsModule } from './stock-locations/stock-locations.module.js';
import { ComercialModule } from './comercial/comercial.module.js';
import { OperacionalModule } from './operacional/operacional.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { SuggestionsModule } from './suggestions/suggestions.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { AiModule } from './ai/ai.module.js';
import { CadastrosModule } from './cadastros/cadastros.module.js';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 240 }]), PrismaModule, UsersModule, AuthModule, StockLocationsModule, CadastrosModule, ComercialModule, OperacionalModule, DashboardModule, SettingsModule, NotificationsModule, AiModule, SuggestionsModule, StorageModule, ReportsModule],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
