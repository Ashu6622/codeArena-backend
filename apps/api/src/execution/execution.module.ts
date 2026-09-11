import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { JavaScriptRunnerService } from './javascript-runner.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [ExecutionController],
  providers: [ExecutionService, JavaScriptRunnerService],
})
export class ExecutionModule {}
