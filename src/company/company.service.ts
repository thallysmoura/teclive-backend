import { BadRequestException, Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { CompanyDto } from './company.dto.js';

export function isValidCnpj(value: string) {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(value) || /^(.)\1+$/.test(value)) return false;
  const digit = (base: string) => {
    let weight = base.length - 7;
    const sum = Array.from(base).reduce((total, character) => { const result = total + (character.charCodeAt(0) - 48) * weight; weight = weight === 2 ? 9 : weight - 1; return result; }, 0);
    const remainder = sum % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  };
  const first = digit(value.slice(0, 12));
  return value.slice(12) === first + digit(value.slice(0, 12) + first);
}

function validateImage(value: string) {
  if (!value) return null;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new BadRequestException('Use uma imagem PNG, JPG ou WebP.');
  const buffer = Buffer.from(match[2], 'base64');
  const valid = match[1] === 'png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : match[1] === 'jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 : buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (!valid || buffer.length > 200 * 1024 || buffer.toString('base64') !== match[2]) throw new BadRequestException('Imagem inválida ou maior que 200 KB.');
  return value;
}

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}
  get() { return this.prisma.companyProfile.findUnique({ where: { id: 'main' } }); }
  save(dto: CompanyDto) {
    if (!isValidCnpj(dto.cnpj)) throw new BadRequestException('O CNPJ informado é inválido.');
    if ((dto.email && !isEmail(dto.email)) || (dto.accountantEmail && !isEmail(dto.accountantEmail))) throw new BadRequestException('Informe um e-mail válido.');
    if (dto.accountantEnabled && (dto.accountantName.length < 2 || dto.accountantCrc.length < 2)) throw new BadRequestException('Informe o nome e o CRC do contador.');
    const data = Object.assign({}, dto, { logoDataUrl: validateImage(dto.logoDataUrl), boletoLogoDataUrl: validateImage(dto.boletoLogoDataUrl) });
    return this.prisma.companyProfile.upsert({ where: { id: 'main' }, create: Object.assign({ id: 'main' }, data), update: data });
  }
}
