import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CatalogsService } from './catalogs.service.js';

@UseGuards(JwtAuthGuard)
@Controller('catalogs/:kind')
export class CatalogsController {
  constructor(private readonly service: CatalogsService) {}

  @Get()
  list(
    @Param('kind') kind: string,
    @Query('descricao') descricao?: string,
    @Query('exibirInativos') exibirInativos?: string,
    @Query('decrescente') decrescente?: string,
    @Query('ordenarPor') ordenarPor?: string,
  ) {
    return this.service.list(kind, { descricao, exibirInativos: exibirInativos === 'true', decrescente: decrescente === 'true', ordenarPor });
  }

  @Get('stats')
  stats(@Param('kind') kind: string) {
    return this.service.stats(kind);
  }

  @Get(':id')
  get(@Param('kind') kind: string, @Param('id') id: string) {
    return this.service.get(kind, id);
  }

  @Post()
  create(@Param('kind') kind: string, @Body() body: { description?: string }) {
    return this.service.create(kind, body.description);
  }

  @Patch(':id')
  rename(@Param('kind') kind: string, @Param('id') id: string, @Body() body: { description?: string }) {
    return this.service.rename(kind, id, body.description);
  }

  @Post(':id/activate')
  activate(@Param('kind') kind: string, @Param('id') id: string) {
    return this.service.setActive(kind, id, true);
  }

  @Post(':id/inactivate')
  inactivate(@Param('kind') kind: string, @Param('id') id: string) {
    return this.service.setActive(kind, id, false);
  }

  @Delete(':id')
  remove(@Param('kind') kind: string, @Param('id') id: string) {
    return this.service.remove(kind, id);
  }
}
