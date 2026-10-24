import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StockLocationsService } from './stock-locations.service.js';

@UseGuards(JwtAuthGuard)
@Controller('stock-locations')
export class StockLocationsController {
  constructor(private readonly service: StockLocationsService) {}

  @Get()
  list(
    @Query('descricao') descricao?: string,
    @Query('exibirInativos') exibirInativos?: string,
    @Query('ordenarPor') ordenarPor?: string,
    @Query('decrescente') decrescente?: string,
  ) {
    return this.service.list({ descricao, exibirInativos: exibirInativos === 'true', ordenarPor, decrescente: decrescente === 'true' });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: { description?: string }) {
    return this.service.create(body.description);
  }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() body: { description?: string }) {
    return this.service.rename(id, body.description);
  }

  @Post(':id/principal')
  setPrincipal(@Param('id') id: string) {
    return this.service.setPrincipal(id);
  }

  @Post(':id/inactivate')
  inactivate(@Param('id') id: string) {
    return this.service.setActive(id, false);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.service.setActive(id, true);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
