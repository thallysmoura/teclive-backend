import { Module } from '@nestjs/common';
import { CatalogsController } from './catalogs.controller.js';
import { CatalogsService } from './catalogs.service.js';
import { LeadsController } from './leads.controller.js';
import { PeopleController } from './people.controller.js';
import { PeopleService } from './people.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { ServicesController } from './services.controller.js';
import { ServicesService } from './services.service.js';

@Module({
  controllers: [CatalogsController, ServicesController, ProductsController, PeopleController, LeadsController],
  providers: [CatalogsService, ServicesService, ProductsService, PeopleService],
})
export class CadastrosModule {}
