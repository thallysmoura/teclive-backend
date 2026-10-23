import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, Length, Matches, MaxLength, ValidateNested } from 'class-validator';

export class NavigationLabelDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value)
  @IsString({ message: 'Informe o nome do item.' })
  @Length(2, 80, { message: 'O nome deve ter entre 2 e 80 caracteres.' })
  // eslint-disable-next-line no-control-regex -- Menu labels must reject control characters.
  @Matches(/^[^\u0000-\u001f\u007f]+$/, { message: 'Informe um nome válido.' })
  label: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || null : value)
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false, disallow_auth: true }, { message: 'Informe uma URL HTTP ou HTTPS válida.' })
  @MaxLength(2048)
  embedUrl?: string | null;
}

export class CreateNavigationDto extends NavigationLabelDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  parentKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => NavigationLabelDto)
  subItems?: NavigationLabelDto[];
}
