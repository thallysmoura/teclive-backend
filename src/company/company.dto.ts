import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsString, Length, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const digits = ({ value }: { value: unknown }) => typeof value === 'string' ? value.replace(/\D/g, '') : value;

export class CompanyDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.replace(/[.\s/-]/g, '').toUpperCase() : value)
  @Matches(/^[A-Z0-9]{12}\d{2}$/, { message: 'Informe um CNPJ válido.' })
  cnpj: string;

  @Transform(trim) @IsString() @Length(2, 160, { message: 'Informe a razão social.' })
  legalName: string;
  @Transform(trim) @IsString() @MaxLength(160)
  tradeName: string;
  @Transform(trim) @IsString() @MaxLength(254)
  email: string;
  @Transform(digits) @Matches(/^(?:\d{10,13})?$/, { message: 'Informe um telefone válido com DDD.' })
  phone: string;
  @Transform(digits) @Matches(/^\d{8}$/, { message: 'Informe um CEP com 8 dígitos.' })
  postalCode: string;
  @Transform(trim) @IsString() @Length(2, 160)
  street: string;
  @Transform(trim) @IsString() @Length(1, 20)
  number: string;
  @Transform(trim) @IsString() @Length(2, 100)
  district: string;
  @Transform(trim) @IsString() @MaxLength(160)
  complement: string;
  @Transform(trim) @IsString() @Length(2, 100)
  city: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsIn(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'])
  state: string;
  @Transform(trim) @IsString() @MaxLength(40)
  municipalRegistration: string;
  @Transform(trim) @IsString() @MaxLength(40)
  stateRegistration: string;
  @Transform(trim) @IsString() @MaxLength(40)
  substituteRegistration: string;
  @IsIn(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI', 'OUTRO'])
  taxRegime: string;
  @Transform(digits) @Matches(/^(?:\d{7})?$/, { message: 'O CNAE deve conter 7 dígitos.' })
  cnae: string;
  @IsBoolean()
  accountantEnabled: boolean;
  @Transform(trim) @IsString() @MaxLength(100)
  accountantName: string;
  @Transform(trim) @IsString() @MaxLength(254)
  accountantEmail: string;
  @Transform(digits) @Matches(/^(?:\d{10,13})?$/, { message: 'Informe um telefone válido para o contador.' })
  accountantPhone: string;
  @Transform(trim) @IsString() @MaxLength(40)
  accountantCrc: string;
  @IsString() @MaxLength(280000)
  logoDataUrl: string;
  @IsString() @MaxLength(280000)
  boletoLogoDataUrl: string;
}
