import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller.js';
import { ContractAdminController } from './contract-admin.controller.js';
import { ContractsService } from './contracts.service.js';

@Module({ controllers: [ContractsController, ContractAdminController], providers: [ContractsService] })
export class ContractsModule {}
