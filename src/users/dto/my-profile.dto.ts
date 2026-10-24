import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class MyProfileDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value)
  @IsString({ message: 'Informe o nome.' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(100, { message: 'O nome deve ter no máximo 100 caracteres.' })
  @Matches(/^(?=.*\p{L})[\p{L}\p{M}\s.'’-]+$/u, { message: 'Informe um nome válido, sem números ou símbolos.' })
  name: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.replace(/\D/g, '') : value)
  @IsString()
  @Matches(/^(\d{10,11})?$/, { message: 'Informe o telefone com DDD (10 ou 11 dígitos).' })
  phone?: string;
}

export class ChangePasswordDto {
  @IsString({ message: 'Informe a senha atual.' })
  currentPassword: string;

  @IsString({ message: 'Informe a nova senha.' })
  @MinLength(6, { message: 'A nova senha deve ter pelo menos 6 caracteres.' })
  @MaxLength(72, { message: 'A nova senha deve ter no máximo 72 caracteres.' })
  newPassword: string;
}
