import { Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module.js';
import { R2Service } from '../storage/r2.service.js';
import { NewsController } from './news.controller.js';

@Module({ imports: [PresenceModule], controllers: [NewsController], providers: [R2Service] })
export class NewsModule {}
