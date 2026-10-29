import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller.js';

@Module({ controllers: [FinanceController] })
export class FinanceModule {}
