import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../common/guards/admin.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminTagsController } from './admin-tags.controller';
import { TagsService } from './tags.service';

@Module({
  imports: [AuthModule, ConfigModule, PrismaModule],
  controllers: [AdminTagsController],
  providers: [TagsService, AdminGuard],
})
export class TagsModule {}
