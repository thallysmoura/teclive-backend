import { BadRequestException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { GoogleService } from './google.service.js';
import { LoginDto } from './dto/login.dto.js';

export const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly google: GoogleService,
  ) {}

  private signAccessToken(user: { id: string; email: string }) {
    return this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      { expiresIn: ACCESS_TOKEN_TTL },
    );
  }

  /** Login com Google: só entra quem já tem cadastro (o administrador libera o e-mail). */
  async loginWithGoogle(idToken: string, keepConnected: boolean, device: string) {
    const g = await this.google.verify(idToken);
    const user = await this.usersService.findByEmail(g.email);
    if (!user) throw new UnauthorizedException('Este e-mail do Google não tem acesso. Peça ao administrador para cadastrá-lo.');
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.refreshTokens.issue(user.id, keepConnected);
    await this.usersService.recordLogin(user.id, device);
    return { accessToken, refreshToken, picture: g.picture, user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, role: user.role, status: user.status, permissions: user.permissions } };
  }

  async login(dto: LoginDto, device: string) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    // Primeiro acesso (nunca entrou antes): com a senha certa, pede a nova senha (ou a confirmação de manter a atual).
    const firstLogin = !user.lastLoginAt;
    if (firstLogin && !dto.newPassword && !dto.keepCurrentPassword) {
      throw new HttpException({ statusCode: 428, code: 'FIRST_LOGIN', message: 'Primeiro acesso: defina a sua nova senha.' }, 428);
    }
    if (dto.newPassword) {
      if (!firstLogin) throw new BadRequestException('A senha só pode ser trocada neste passo no primeiro acesso. Use Meus Dados.');
      if (dto.newPassword === dto.password) throw new BadRequestException('A nova senha deve ser diferente da senha atual.');
      await this.usersService.setPassword(user.id, dto.newPassword);
    }

    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.refreshTokens.issue(user.id, !!dto.keepConnected);
    await this.usersService.recordLogin(user.id, device);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status,
        permissions: user.permissions,
      },
    };
  }

  async refresh(rawRefreshToken: string) {
    const rotated = await this.refreshTokens.rotate(rawRefreshToken);
    if (!rotated) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const user = await this.usersService.findById(rotated.userId);
    if (!user) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const accessToken = await this.signAccessToken(user);

    return {
      accessToken,
      refreshToken: { raw: rotated.raw, ttl: rotated.ttl, remember: rotated.remember },
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}
