import { Body, Controller, Inject, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateProblemDto } from './dto/create-problem.dto';
import { ProblemsService } from './problems.service';

@Controller('admin/problems')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminProblemsController {
  constructor(@Inject(ProblemsService) private readonly problems: ProblemsService) {}

  @Post()
  create(
    @Body(
      new ValidationPipe({
        expectedType: CreateProblemDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    dto: CreateProblemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.problems.create(dto, user.sub);
  }
}
