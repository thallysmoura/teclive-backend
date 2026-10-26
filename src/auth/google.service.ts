import { Injectable, UnauthorizedException } from '@nestjs/common';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

@Injectable()
export class GoogleService {
  private app() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) throw new UnauthorizedException('Login com Google não está configurado.');
    return getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }

  /** Confere o token do Google (assinatura, validade e projeto) e devolve o e-mail verificado. */
  async verify(idToken: string) {
    try {
      const t = await getAuth(this.app()).verifyIdToken(idToken, true);
      if (!t.email || !t.email_verified || t.firebase?.sign_in_provider !== 'google.com') throw new Error('invalid');
      return { email: t.email.toLowerCase(), name: t.name ?? null, picture: t.picture ?? null };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Não foi possível validar o login com Google.');
    }
  }
}
