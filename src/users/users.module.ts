import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { PresenceModule } from '../presence/presence.module.js';
import { NavigationController } from '../navigation/navigation.controller.js';
import { NavigationService } from '../navigation/navigation.service.js';

@Module({
  imports: [PresenceModule],
  controllers: [UsersController, NavigationController],
  providers: [UsersService, AdminGuard, NavigationService],
  exports: [UsersService],
})
export class UsersModule {}
