import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CppRunnerService } from './cpp-runner.service';
import { DockerCodeExecutorService } from './docker-code-executor.service';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { JavaScriptRunnerService } from './javascript-runner.service';
import { PythonRunnerService } from './python-runner.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [ExecutionController],
  providers: [
    ExecutionService,
    JavaScriptRunnerService,
    PythonRunnerService,
    CppRunnerService,
    DockerCodeExecutorService,
  ],
  exports: [
    ExecutionService,
    JavaScriptRunnerService,
    PythonRunnerService,
    CppRunnerService,
    DockerCodeExecutorService,
  ],
})
export class ExecutionModule {}
