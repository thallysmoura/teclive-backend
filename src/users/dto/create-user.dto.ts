import { ArrayUnique, IsArray, IsString, MaxLength } from 'class-validator';
import { UserProfileDto } from './user-profile.dto.js';

export class CreateUserDto extends UserProfileDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permissions: string[];
}
