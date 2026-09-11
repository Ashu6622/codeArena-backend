import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';

type RequestWithUser = {
  user?: AuthenticatedUser;
};

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) throw new UnauthorizedException('Authentication required');

    const user = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { role: true },
    });

    if (!user) throw new UnauthorizedException('Authentication required');
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Admin access required');
    return true;
  }
}
