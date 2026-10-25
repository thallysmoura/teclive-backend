import { Module } from '@nestjs/common';
import { R2Service } from '../storage/r2.service.js';
import { SuggestionsController } from './suggestions.controller.js';

@Module({ controllers: [SuggestionsController], providers: [R2Service] })
export class SuggestionsModule {}
