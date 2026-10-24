import { Body, Controller, Get, Patch, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, ACCESS_TOKEN_TTL_MS } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { CheckEmailDto } from './dto/check-email.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { UsersService } from '../users/users.service.js';
import { detectDevice } from '../users/device.util.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { PresenceGateway } from '../presence/presence.gateway.js';
import { MyProfileDto, ChangePasswordDto } from '../users/dto/my-profile.dto.js';
import { AccessLogsService } from '../access-logs/access-logs.service.js';

const ACCESS_COOKIE = 'eugestor_token';
const REFRESH_COOKIE = 'eugestor_refresh';
const isProd = process.env.NODE_ENV === 'production';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly presence: PresenceGateway,
    private readonly accessLogs: AccessLogsService,
  ) {}

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: { raw: string; ttl: number },
    remember: boolean,
  ) {
    res.cookie(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: ACCESS_TOKEN_TTL_MS,
    });

    res.cookie(REFRESH_COOKIE, refreshToken.raw, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/auth',
      // Sem "remember": cookie de sessão (apagado ao fechar o navegador).
      ...(remember ? { maxAge: refreshToken.ttl } : {}),
    });
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const device = detectDevice(req.headers['user-agent']);
    const result = await this.authService.login(dto, device).catch(async (error: unknown) => {
      if (error instanceof UnauthorizedException) {
        const user = await this.usersService.findByEmail(dto.email);
        await this.accessLogs.record(user, device, dto, req.ip, req.headers['user-agent'], 'INVALID');
      }
      throw error;
    });
    await this.accessLogs.record(result.user, device, dto, req.ip, req.headers['user-agent']);
    if (await this.usersService.notifyAccessRequest(result.user.id).catch(() => false)) this.presence.notifyAdmins();
    this.setAuthCookies(res, result.accessToken, result.refreshToken, !!dto.keepConnected);
    return { user: result.user };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const result = await this.authService.refresh(rawRefreshToken);
    this.setAuthCookies(res, result.accessToken, result.refreshToken, result.refreshToken.remember);
    return { user: result.user };
  }

  @Post('check-email')
  async checkEmail(@Body() dto: CheckEmailDto) {
    const user = await this.usersService.findByEmail(dto.email);
    return { exists: !!user };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE];
    if (rawRefreshToken) {
      await this.refreshTokens.revoke(rawRefreshToken);
    }
    this.presence.disconnectSession(req.cookies?.[ACCESS_COOKIE]);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: Request) {
    const payload = req.user as { id: string; email: string };
    const user = await this.usersService.findById(payload.id);
    if (!user) return null;
    void this.usersService.touchLastSeen(user.id);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      permissions: user.permissions,
      avatarUrl: user.avatarUrl,
      phone: user.phone ?? '',
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Req() req: Request, @Body() dto: MyProfileDto) {
    return this.usersService.updateMyProfile((req.user as { id: string }).id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/password')
  changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword((req.user as { id: string }).id, dto.currentPassword, dto.newPassword);
  }
}
