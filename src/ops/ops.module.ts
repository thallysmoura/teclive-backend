import { Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module.js';
import { OpsController } from './ops.controller.js';
import { OpsService } from './ops.service.js';

@Module({ imports: [PresenceModule], controllers: [OpsController], providers: [OpsService], exports: [OpsService] })
export class OpsModule {}
