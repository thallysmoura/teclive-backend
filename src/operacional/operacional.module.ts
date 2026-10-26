import { Module } from '@nestjs/common';
import { LookupsController, ServiceOrdersController } from './operacional.controller.js';
import { LookupsService } from './lookups.service.js';
import { OpsModule } from '../ops/ops.module.js';
import { R2Service } from '../storage/r2.service.js';
import { ServiceOrdersService } from './service-orders.service.js';

@Module({
  imports: [OpsModule],
  controllers: [LookupsController, ServiceOrdersController],
  providers: [LookupsService, ServiceOrdersService, R2Service],
  exports: [ServiceOrdersService],
})
export class OperacionalModule {}
