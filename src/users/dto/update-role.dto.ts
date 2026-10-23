import { IsIn } from 'class-validator';

export class UpdateRoleDto {
  @IsIn(['ADMIN', 'USER'])
  role: 'ADMIN' | 'USER';
}
