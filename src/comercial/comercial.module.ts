import { Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller.js';
import { QuotesService } from './quotes.service.js';
import { CalendarEventsController, QuoteModelsController, QuoteTemplatesController, RefusalReasonsController, SalesActionsController } from './records.controller.js';
import { CalendarEventsService, QuoteModelsService, QuoteTemplatesService, RefusalReasonsService, SalesActionsService } from './records.service.js';

@Module({
  controllers: [QuotesController, RefusalReasonsController, SalesActionsController, QuoteModelsController, QuoteTemplatesController, CalendarEventsController],
  providers: [QuotesService, RefusalReasonsService, SalesActionsService, QuoteModelsService, QuoteTemplatesService, CalendarEventsService],
})
export class ComercialModule {}
