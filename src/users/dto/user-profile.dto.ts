import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UserProfileDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail({ require_tld: true, allow_utf8_local_part: false, host_blacklist: ['example.com', 'example.org', 'example.net'] }, { message: 'Informe um e-mail válido, com domínio real.' })
  @MaxLength(254, { message: 'O e-mail deve ter no máximo 254 caracteres.' })
  email: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value)
  @IsString({ message: 'Informe o nome.' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(100, { message: 'O nome deve ter no máximo 100 caracteres.' })
  @Matches(/^(?=.*\p{L})[\p{L}\p{M}\s.'’-]+$/u, { message: 'Informe um nome válido, sem números ou símbolos.' })
  name: string;
}
