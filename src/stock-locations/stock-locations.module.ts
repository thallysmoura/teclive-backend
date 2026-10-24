import { Module } from '@nestjs/common';
import { StockLocationsService } from './stock-locations.service.js';
import { StockLocationsController } from './stock-locations.controller.js';
import { StockMovementsService } from './stock-movements.service.js';
import { StockMovementsController } from './stock-movements.controller.js';
import { StockBalancesService } from './stock-balances.service.js';
import { StockBalancesController } from './stock-balances.controller.js';
import { StockProductsService } from './stock-products.service.js';
import { StockProductsController } from './stock-products.controller.js';

@Module({
  controllers: [StockLocationsController, StockMovementsController, StockBalancesController, StockProductsController],
  providers: [StockLocationsService, StockMovementsService, StockBalancesService, StockProductsService],
})
export class StockLocationsModule {}
