import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';

import { envConfig } from './config/env.config';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
      validationSchema: envValidationSchema,
    }),
    HealthModule,
    AuthModule,
    PrismaModule,
  ],
})
export class AppModule {}
