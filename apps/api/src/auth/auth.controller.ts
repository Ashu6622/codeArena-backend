import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

const REFRESH_COOKIE = 'codearena_refresh';

type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  expires?: Date;
};

type CookieResponse = {
  cookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string, options: Omit<CookieOptions, 'expires'>): void;
};

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('signup')
  signup(
    // tsx does not emit parameter metadata; keep DTO validation explicit.
    @Body(
      new ValidationPipe({
        expectedType: SignupDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    dto: SignupDto,
  ) {
    return this.auth.signup(dto);
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(
      new ValidationPipe({
        expectedType: LoginDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    dto: LoginDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.auth.login(dto);
    this.setRefreshCookie(response, result.rawToken, result.expiresAt);
    return result.response;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.auth.refresh(this.readRefreshCookie(cookieHeader));
    this.setRefreshCookie(response, result.rawToken, result.expiresAt);
    return result.response;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    await this.auth.logout(this.readOptionalRefreshCookie(cookieHeader));
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getProfile(user.sub);
  }

  private setRefreshCookie(response: CookieResponse, token: string, expires: Date): void {
    response.cookie(REFRESH_COOKIE, token, { ...this.cookieOptions(), expires });
  }

  private cookieOptions(): Omit<CookieOptions, 'expires'> {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
    };
  }

  private readRefreshCookie(header?: string): string {
    const token = this.readOptionalRefreshCookie(header);
    if (!token) throw new UnauthorizedException('Invalid refresh session');
    return token;
  }

  private readOptionalRefreshCookie(header?: string): string | undefined {
    return header
      ?.split(';')
      .map((cookie) => cookie.trim().split('='))
      .find(([name]) => name === REFRESH_COOKIE)
      ?.slice(1)
      .join('=');
  }
}
