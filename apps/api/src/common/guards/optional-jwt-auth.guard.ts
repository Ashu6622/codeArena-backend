import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/auth.types';

type RequestWithHeadersAndUser = {
  headers: { authorization?: string };
  user?: AuthenticatedUser;
};

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeadersAndUser>();
    const [scheme, token, extra] = request.headers.authorization?.split(' ') ?? [];

    if (!request.headers.authorization) return true;
    if (scheme !== 'Bearer' || !token || extra) return true;

    try {
      const payload = await this.jwt.verifyAsync<AuthenticatedUser>(token, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      });

      if (
        typeof payload.sub === 'string' &&
        typeof payload.email === 'string' &&
        Object.values(Role).includes(payload.role)
      ) {
        request.user = payload;
      }
    } catch {
      return true;
    }

    return true;
  }
}
