import { Module } from '@nestjs/common';
import { ReportsAiService } from './reports-ai.service.js';
import { ReportsController } from './reports.controller.js';

@Module({ controllers: [ReportsController], providers: [ReportsAiService] })
export class ReportsModule {}
