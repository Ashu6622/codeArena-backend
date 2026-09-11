import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type IssuedRefreshToken = {
  rawToken: string;
  expiresAt: Date;
};

type RotatedRefreshToken = IssuedRefreshToken & {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: 'USER' | 'ADMIN';
    createdAt: Date;
  };
};

class RefreshRotationConflict extends Error {}

@Injectable()
export class RefreshTokenService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async create(userId: string): Promise<IssuedRefreshToken> {
    const familyId = randomUUID();
    const token = this.generate();
    await this.prisma.refreshSession.create({
      data: {
        userId,
        familyId,
        tokenHash: this.hash(token.rawToken),
        expiresAt: token.expiresAt,
      },
    });
    return token;
  }

  async rotate(rawToken: string): Promise<RotatedRefreshToken> {
    const now = new Date();
    const tokenHash = this.hash(rawToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, email: true, name: true, role: true, createdAt: true },
        },
      },
    });

    if (!session) throw this.unauthorized();

    if (session.revokedAt) {
      await this.revokeFamily(session.familyId, now);
      throw this.unauthorized();
    }

    if (session.expiresAt <= now) {
      await this.prisma.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
      throw this.unauthorized();
    }

    const replacement = this.generate();

    try {
      await this.prisma.$transaction(async (transaction) => {
        const consumed = await transaction.refreshSession.updateMany({
          where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
          data: { revokedAt: now },
        });

        if (consumed.count !== 1) throw new RefreshRotationConflict();

        await transaction.refreshSession.create({
          data: {
            userId: session.userId,
            familyId: session.familyId,
            tokenHash: this.hash(replacement.rawToken),
            expiresAt: replacement.expiresAt,
          },
        });
      });
    } catch (error) {
      if (error instanceof RefreshRotationConflict) {
        await this.revokeFamily(session.familyId, now);
        throw this.unauthorized();
      }
      throw error;
    }

    return { ...replacement, user: session.user };
  }

  async revoke(rawToken?: string): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: this.hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private generate(): IssuedRefreshToken {
    const rawToken = randomBytes(32).toString('base64url');
    const expiresInMs = this.parseDuration(this.config.getOrThrow<string>('jwt.refreshExpiresIn'));
    return { rawToken, expiresAt: new Date(Date.now() + expiresInMs) };
  }

  private hash(rawToken: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('jwt.refreshSecret'))
      .update(rawToken)
      .digest('hex');
  }

  private parseDuration(value: string): number {
    const match = /^(\d{1,5})([smhd])$/.exec(value);
    if (!match) throw new Error('Invalid refresh-token expiry configuration');

    const units: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    const duration = Number(match[1]) * units[match[2]];
    if (!Number.isSafeInteger(duration) || duration <= 0 || duration > 365 * units.d) {
      throw new Error('Refresh-token expiry must be between 1 second and 365 days');
    }
    return duration;
  }

  private revokeFamily(familyId: string, revokedAt: Date) {
    return this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }

  private unauthorized() {
    return new UnauthorizedException('Invalid refresh session');
  }
}
