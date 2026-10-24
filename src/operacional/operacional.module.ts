import { Module } from '@nestjs/common';
import { LookupsController, ServiceOrdersController } from './operacional.controller.js';
import { LookupsService } from './lookups.service.js';
import { ServiceOrdersService } from './service-orders.service.js';

@Module({
  controllers: [LookupsController, ServiceOrdersController],
  providers: [LookupsService, ServiceOrdersService],
  exports: [ServiceOrdersService],
})
export class OperacionalModule {}
