import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../common/guards/admin.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminProblemsController } from './admin-problems.controller';
import { ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';

@Module({
  imports: [AuthModule, ConfigModule, PrismaModule],
  controllers: [ProblemsController, AdminProblemsController],
  providers: [ProblemsService, AdminGuard, OptionalJwtAuthGuard],
})
export class ProblemsModule {}
