import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateUserDto } from './create-user.dto.js';

describe('CreateUserDto', () => {
  it.each(['   ', 'A', '12345'])('rejects invalid name %j', async (name) => {
    const dto = plainToInstance(CreateUserDto, { name, email: 'person@gmail.com', permissions: [] });
    expect((await validate(dto)).some((error) => error.property === 'name')).toBe(true);
  });

  it.each(['fake', 'person@localhost', 'person@example.com'])('rejects invalid email %j', async (email) => {
    const dto = plainToInstance(CreateUserDto, { name: 'Ana Maria', email, permissions: [] });
    expect((await validate(dto)).some((error) => error.property === 'email')).toBe(true);
  });

  it('normalizes spaces and email casing before validation', async () => {
    const dto = plainToInstance(CreateUserDto, { name: '  Ana   Maria  ', email: ' ANA@GMAIL.COM ', permissions: ['inicio'] });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.name).toBe('Ana Maria');
    expect(dto.email).toBe('ana@gmail.com');
  });
});
