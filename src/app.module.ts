import { Module } from '@nestjs/common';
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
import { AiModule } from './ai/ai.module.js';
import { CadastrosModule } from './cadastros/cadastros.module.js';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, StockLocationsModule, CadastrosModule, ComercialModule, OperacionalModule, DashboardModule, SettingsModule, NotificationsModule, AiModule, SuggestionsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
