import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  // Em produção não sobe com segredo fraco ou padrão (qualquer um poderia forjar sessões).
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.JWT_SECRET ?? '';
    if (secret.length < 32 || /change-me|secret|senha|123456/i.test(secret)) throw new Error('JWT_SECRET ausente ou fraco: defina um valor aleatório com 32+ caracteres.');
    if (!process.env.WEB_ORIGIN) throw new Error('WEB_ORIGIN é obrigatório em produção (origem permitida no CORS).');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.useBodyParser('json', { limit: '4mb' });
  // Foto de perfil enviada como arquivo bruto (a tela já reduz para 512 px; o servidor ainda limita e confere o conteúdo).
  app.useBodyParser('raw', { type: ['image/webp', 'image/jpeg', 'image/png'], limit: '1500kb' });
  app.use(cookieParser());
  // CORS fechado: só a origem do app, com cookies e métodos conhecidos (nada de "*").
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
