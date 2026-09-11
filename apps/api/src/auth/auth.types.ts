import { Role } from '@prisma/client';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: Role;
};

export type AuthenticatedUser = AccessTokenPayload & {
  iat: number;
  exp: number;
};
