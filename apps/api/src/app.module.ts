import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';

import { envConfig } from './config/env.config';
import { envValidationSchema } from './config/env.validation';
import { ExecutionModule } from './execution/execution.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProblemsModule } from './problems/problems.module';
import { SubmissionsModule } from './submissions/submissions.module';

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
    ProblemsModule,
    ExecutionModule,
    SubmissionsModule,
  ],
})
export class AppModule {}
