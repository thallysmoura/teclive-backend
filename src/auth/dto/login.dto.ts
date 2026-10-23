import { Type } from 'class-transformer';
import { IsBoolean, IsDefined, IsEmail, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

export class LoginLocationDto {
  @IsNumber() @Min(-90) @Max(90)
  latitude: number;

  @IsNumber() @Min(-180) @Max(180)
  longitude: number;

  @IsNumber() @Min(0) @Max(10000000)
  accuracy: number;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @IsBoolean()
  keepConnected?: boolean;

  @IsOptional()
  @IsIn(['not_requested', 'denied', 'unavailable', 'shared'])
  locationStatus?: 'not_requested' | 'denied' | 'unavailable' | 'shared';

  @ValidateIf((dto: LoginDto) => dto.locationStatus === 'shared')
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => LoginLocationDto)
  location?: LoginLocationDto;
}
