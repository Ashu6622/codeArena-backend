import { Body, Controller, Inject, Post, ValidationPipe } from '@nestjs/common';
import { RunCodeDto } from './dto/run-code.dto';
import { ExecutionService } from './execution.service';

@Controller('run')
export class ExecutionController {
  constructor(@Inject(ExecutionService) private readonly execution: ExecutionService) {}

  @Post()
  run(
    @Body(
      new ValidationPipe({
        expectedType: RunCodeDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    dto: RunCodeDto,
  ) {
    return this.execution.run(dto);
  }
}
