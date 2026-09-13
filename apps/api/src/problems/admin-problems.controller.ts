import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminListProblemsQueryDto } from './dto/admin-list-problems-query.dto';
import { CreateProblemDto } from './dto/create-problem.dto';
import { ProblemSlugParamDto } from './dto/problem-slug-param.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import { ProblemsService } from './problems.service';

const validationPipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
};

@Controller('admin/problems')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminProblemsController {
  constructor(@Inject(ProblemsService) private readonly problems: ProblemsService) {}

  @Get()
  list(
    @Query(
      new ValidationPipe({
        ...validationPipeOptions,
        expectedType: AdminListProblemsQueryDto,
      }),
    )
    query: AdminListProblemsQueryDto,
  ) {
    return this.problems.listAdmin(query);
  }

  @Get(':slug')
  findBySlug(
    @Param(
      new ValidationPipe({
        ...validationPipeOptions,
        expectedType: ProblemSlugParamDto,
      }),
    )
    params: ProblemSlugParamDto,
  ) {
    return this.problems.findAdminBySlug(params.slug);
  }

  @Post()
  create(
    @Body(
      new ValidationPipe({
        ...validationPipeOptions,
        expectedType: CreateProblemDto,
      }),
    )
    dto: CreateProblemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.problems.create(dto, user.sub);
  }

  @Patch(':slug/archive')
  archive(
    @Param(
      new ValidationPipe({
        ...validationPipeOptions,
        expectedType: ProblemSlugParamDto,
      }),
    )
    params: ProblemSlugParamDto,
  ) {
    return this.problems.archiveAdmin(params.slug);
  }

  @Patch(':slug')
  update(
    @Param(
      new ValidationPipe({
        ...validationPipeOptions,
        expectedType: ProblemSlugParamDto,
      }),
    )
    params: ProblemSlugParamDto,
    @Body(
      new ValidationPipe({
        ...validationPipeOptions,
        expectedType: UpdateProblemDto,
      }),
    )
    dto: UpdateProblemDto,
  ) {
    return this.problems.updateAdmin(params.slug, dto);
  }
}
