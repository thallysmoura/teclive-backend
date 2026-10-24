import { Module } from '@nestjs/common';
import { ComercialModule } from '../comercial/comercial.module.js';
import { OperacionalModule } from '../operacional/operacional.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({ imports: [ComercialModule, OperacionalModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
