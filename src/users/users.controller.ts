import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdatePermissionsDto } from './dto/update-permissions.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { UserProfileDto } from './dto/user-profile.dto.js';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('permissions-catalog')
  permissionsCatalog() {
    return this.usersService.permissionsCatalog();
  }

  @Get()
  list() {
    return this.usersService.listAll();
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const { user, password } = await this.usersService.createWithGeneratedPassword(dto);
    return { user, password };
  }

  @Patch(':id/permissions')
  updatePermissions(@Param('id') id: string, @Body() dto: UpdatePermissionsDto) {
    return this.usersService.updatePermissions(id, dto.permissions);
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.usersService.updateRole(id, dto.role);
  }

  @Post(':id/reset-password')
  @Header('Cache-Control', 'no-store')
  resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.resetPassword(id);
  }

  @Patch(':id/profile')
  updateProfile(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UserProfileDto) {
    return this.usersService.updateProfile(id, dto);
  }
}
