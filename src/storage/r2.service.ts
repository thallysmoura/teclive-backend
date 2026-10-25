import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/** Cloudflare R2 pela API compatível com S3 (assinatura SigV4 própria: sem dependências extras). */
@Injectable()
export class R2Service {
  private config() {
    const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: accessKey, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET: bucket, R2_PUBLIC_URL: publicUrl } = process.env;
    if (!account || !accessKey || !secret || !bucket || !publicUrl) throw new ServiceUnavailableException('O armazenamento de imagens ainda não foi configurado.');
    return { account, accessKey, secret, bucket, publicUrl: publicUrl.replace(/\/+$/, '') };
  }

  get configured() {
    const e = process.env;
    return !!(e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET && e.R2_PUBLIC_URL);
  }

  publicUrl(key: string) { return `${this.config().publicUrl}/${key}`; }

  /** Chave do objeto a partir do endereço público (só para endereços que são nossos). */
  keyFromUrl(url: string | null | undefined): string | null {
    if (!url || !this.configured) return null;
    const base = `${this.config().publicUrl}/`;
    return url.startsWith(base) ? url.slice(base.length) : null;
  }

  private async request(method: 'PUT' | 'DELETE', key: string, body: Buffer | null, headers: Record<string, string> = {}) {
    const c = this.config();
    const host = `${c.account}.r2.cloudflarestorage.com`;
    const path = `/${c.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const payloadHash = sha256(body ?? '');
    const signed: Record<string, string> = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) };
    const names = Object.keys(signed).sort();
    const canonical = [method, path, '', ...names.map((n) => `${n}:${signed[n].trim()}`), '', names.join(';'), payloadHash].join('\n');
    const scope = `${date}/auto/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${c.secret}`, date), 'auto'), 's3'), 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
    const res = await fetch(`https://${host}${path}`, {
      method,
      headers: { ...Object.fromEntries(names.filter((n) => n !== 'host').map((n) => [n, signed[n]])), Authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` },
      body: body ? new Uint8Array(body) : undefined,
    });
    if (!res.ok && !(method === 'DELETE' && res.status === 404)) throw new ServiceUnavailableException(`Falha ao falar com o armazenamento de imagens (${res.status}).`);
  }

  put(key: string, body: Buffer, contentType: string) {
    return this.request('PUT', key, body, { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' });
  }

  delete(key: string) { return this.request('DELETE', key, null); }
}
