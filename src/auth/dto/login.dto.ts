import { Type } from 'class-transformer';
import { IsBoolean, IsDefined, IsEmail, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

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

  /** Só vale no primeiro acesso: define a senha nova no mesmo passo do login. */
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'A nova senha deve ter pelo menos 6 caracteres.' })
  @MaxLength(72, { message: 'A nova senha deve ter no máximo 72 caracteres.' })
  newPassword?: string;

  /** Primeiro acesso: entrar mantendo a senha atual. */
  @IsOptional()
  @IsBoolean()
  keepCurrentPassword?: boolean;

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
