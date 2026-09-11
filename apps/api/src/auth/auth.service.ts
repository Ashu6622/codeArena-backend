import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { PasswordService } from './password.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async signup(dto: SignupDto) {
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      return await this.prisma.user.create({
        data: { email: dto.email, name: dto.name, passwordHash },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
    } catch (error) {
      // The unique constraint also protects concurrent signup requests.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const passwordMatches = await this.passwords.verify(dto.password, user?.passwordHash);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const expiresIn = this.config.getOrThrow<string>(
      'jwt.accessExpiresIn',
    ) as JwtSignOptions['expiresIn'];
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn,
    });

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn,
      user: this.toPublicUser(user),
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    if (!user) throw new UnauthorizedException('Authentication required');
    return this.toPublicUser(user);
  }

  private toPublicUser<
    T extends {
      id: string;
      email: string;
      name: string | null;
      role: Role;
      createdAt: Date;
    },
  >(user: T) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
