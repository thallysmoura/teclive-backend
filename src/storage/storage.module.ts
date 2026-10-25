import { Module } from '@nestjs/common';
import { R2Service } from './r2.service.js';
import { StorageController } from './storage.controller.js';

@Module({ controllers: [StorageController], providers: [R2Service] })
export class StorageModule {}
