import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Resolver } from 'node:dns/promises';

const missingRecord = (error: unknown) => ['ENODATA', 'ENOTFOUND'].includes((error as NodeJS.ErrnoException)?.code ?? '');

export async function validateEmailDomain(email: string): Promise<void> {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  const resolver = new Resolver({ timeout: 3000, tries: 1 });
  const invalid = () => new BadRequestException('O domínio deste e-mail não recebe mensagens. Confira o endereço.');
  const unavailable = () => new ServiceUnavailableException('Não foi possível verificar o domínio do e-mail agora. Tente novamente.');
  try {
    const records = await resolver.resolveMx(domain);
    if (records.length > 0) {
      if (records.some((record) => record.exchange && record.exchange !== '.')) return;
      throw invalid();
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    if ((error as NodeJS.ErrnoException)?.code === 'ENOTFOUND') throw invalid();
    if (!missingRecord(error)) throw unavailable();
  }

  // SMTP also permits the domain's own address when no MX record exists.
  const addresses = await Promise.allSettled([resolver.resolve4(domain), resolver.resolve6(domain)]);
  if (addresses.some((result) => result.status === 'fulfilled' && result.value.length > 0)) return;
  if (addresses.some((result) => result.status === 'rejected' && !missingRecord(result.reason))) throw unavailable();
  throw invalid();
}
