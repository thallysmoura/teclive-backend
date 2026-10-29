import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';

@Module({ controllers: [BillingController] })
export class BillingModule {}
