import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CppRunnerService } from '../execution/cpp-runner.service';
import { JavaScriptRunnerService } from '../execution/javascript-runner.service';
import { PythonRunnerService } from '../execution/python-runner.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [AuthModule, ConfigModule, PrismaModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, JavaScriptRunnerService, PythonRunnerService, CppRunnerService],
})
export class SubmissionsModule {}
