import { Controller, Get, Inject, Param, Query, ValidationPipe } from '@nestjs/common';
import { ListProblemsQueryDto } from './dto/list-problems-query.dto';
import { ProblemSlugParamDto } from './dto/problem-slug-param.dto';
import { ProblemsService } from './problems.service';

@Controller('problems')
export class ProblemsController {
  constructor(@Inject(ProblemsService) private readonly problems: ProblemsService) {}

  @Get()
  list(
    @Query(
      new ValidationPipe({
        expectedType: ListProblemsQueryDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    query: ListProblemsQueryDto,
  ) {
    return this.problems.list(query);
  }

  @Get(':slug')
  findBySlug(
    @Param(
      new ValidationPipe({
        expectedType: ProblemSlugParamDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    params: ProblemSlugParamDto,
  ) {
    return this.problems.findBySlug(params.slug);
  }
}
