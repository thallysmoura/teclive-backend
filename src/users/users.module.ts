import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { PresenceModule } from '../presence/presence.module.js';
import { NavigationController } from '../navigation/navigation.controller.js';
import { NavigationService } from '../navigation/navigation.service.js';
import { AccessLogsService } from '../access-logs/access-logs.service.js';
import { AccessLogsController } from '../access-logs/access-logs.controller.js';
import { LocationService } from '../access-logs/location.service.js';
import { AccessLogsPermissionGuard } from '../access-logs/access-logs-permission.guard.js';
import { CompanyController } from '../company/company.controller.js';
import { CompanyService } from '../company/company.service.js';
import { CompanyPermissionGuard } from '../company/company-permission.guard.js';

@Module({
  imports: [PresenceModule],
  controllers: [UsersController, NavigationController, AccessLogsController, CompanyController],
  providers: [UsersService, AdminGuard, NavigationService, AccessLogsService, LocationService, AccessLogsPermissionGuard, CompanyService, CompanyPermissionGuard],
  exports: [UsersService, AccessLogsService],
})
export class UsersModule {}
