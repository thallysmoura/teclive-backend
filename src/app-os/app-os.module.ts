import { Module } from '@nestjs/common';
import { AppOsController } from './app-os.controller.js';

@Module({ controllers: [AppOsController] })
export class AppOsModule {}
