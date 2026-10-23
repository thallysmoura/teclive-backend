import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { CreateNavigationDto, NavigationLabelDto } from './navigation.dto.js';
import { NavigationService } from './navigation.service.js';

@UseGuards(JwtAuthGuard)
@Controller('navigation')
export class NavigationController {
  constructor(private readonly navigation: NavigationService) {}

  @Get()
  list(@Req() req: Request) { return this.navigation.listForUser((req.user as { id: string }).id); }

  @Get(':key')
  page(@Param('key') key: string, @Req() req: Request) { return this.navigation.getForUser(key, (req.user as { id: string }).id); }

  @UseGuards(AdminGuard)
  @Post()
  create(@Body() dto: CreateNavigationDto, @Req() req: Request) { return this.navigation.create(dto.label, dto.embedUrl, dto.parentKey, dto.subItems, (req.user as { id: string }).id); }

  @UseGuards(AdminGuard)
  @Patch(':key')
  rename(@Param('key') key: string, @Body() dto: NavigationLabelDto) { return this.navigation.rename(key, dto.label, dto.embedUrl); }

  @UseGuards(AdminGuard)
  @Delete(':key')
  remove(@Param('key') key: string, @Req() req: Request) { return this.navigation.remove(key, (req.user as { id: string }).id); }
}
