import { Resolver } from 'node:dns/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateEmailDomain } from './email-domain.js';

afterEach(() => vi.restoreAllMocks());

describe('email domain validation', () => {
  it('accepts domains with a mail server', async () => {
    vi.spyOn(Resolver.prototype, 'resolveMx').mockResolvedValue([{ priority: 10, exchange: 'mx.mail.test' }]);
    await expect(validateEmailDomain('ana@mail.test')).resolves.toBeUndefined();
  });

  it('rejects domains that explicitly refuse email (null MX)', async () => {
    vi.spyOn(Resolver.prototype, 'resolveMx').mockResolvedValue([{ priority: 0, exchange: '' }]);
    await expect(validateEmailDomain('ana@mail.test')).rejects.toMatchObject({ status: 400 });
  });

  it('rejects nonexistent domains', async () => {
    vi.spyOn(Resolver.prototype, 'resolveMx').mockRejectedValue({ code: 'ENOTFOUND' });
    await expect(validateEmailDomain('ana@missing.test')).rejects.toMatchObject({ status: 400 });
  });

  it('accepts the implicit SMTP address fallback when MX is absent', async () => {
    vi.spyOn(Resolver.prototype, 'resolveMx').mockRejectedValue({ code: 'ENODATA' });
    vi.spyOn(Resolver.prototype, 'resolve4').mockResolvedValue(['192.0.2.1']);
    vi.spyOn(Resolver.prototype, 'resolve6').mockRejectedValue({ code: 'ENODATA' });
    await expect(validateEmailDomain('ana@mail.test')).resolves.toBeUndefined();
  });

  it('rejects a domain with no MX or address records', async () => {
    vi.spyOn(Resolver.prototype, 'resolveMx').mockResolvedValue([]);
    vi.spyOn(Resolver.prototype, 'resolve4').mockRejectedValue({ code: 'ENODATA' });
    vi.spyOn(Resolver.prototype, 'resolve6').mockRejectedValue({ code: 'ENODATA' });
    await expect(validateEmailDomain('ana@mail.test')).rejects.toMatchObject({ status: 400 });
  });

  it('treats DNS timeouts as temporary failures, rather than invalid emails', async () => {
    vi.spyOn(Resolver.prototype, 'resolveMx').mockRejectedValue({ code: 'ETIMEOUT' });
    await expect(validateEmailDomain('ana@mail.test')).rejects.toMatchObject({ status: 503 });
  });
});
