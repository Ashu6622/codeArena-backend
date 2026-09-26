import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CreateProblemCommentDto } from './dto/create-problem-comment.dto';
import { ListProblemsQueryDto } from './dto/list-problems-query.dto';
import { ProblemSlugParamDto } from './dto/problem-slug-param.dto';
import { UpsertProblemNoteDto } from './dto/upsert-problem-note.dto';
import { ProblemsService } from './problems.service';

@Controller('problems')
@UseGuards(OptionalJwtAuthGuard)
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
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.problems.list(query, user?.sub);
  }

  @Put(':slug/bookmark')
  @UseGuards(JwtAuthGuard)
  bookmark(
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.problems.bookmark(params.slug, user.sub);
  }

  @Delete(':slug/bookmark')
  @UseGuards(JwtAuthGuard)
  unbookmark(
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.problems.unbookmark(params.slug, user.sub);
  }

  @Get(':slug/comments')
  listComments(
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
    return this.problems.listComments(params.slug);
  }

  @Post(':slug/comments')
  @UseGuards(JwtAuthGuard)
  createComment(
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
    @Body(
      new ValidationPipe({
        expectedType: CreateProblemCommentDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    dto: CreateProblemCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.problems.createComment(params.slug, user.sub, dto);
  }

  @Get(':slug/note')
  @UseGuards(JwtAuthGuard)
  getNote(
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.problems.getNote(params.slug, user.sub);
  }

  @Put(':slug/note')
  @UseGuards(JwtAuthGuard)
  upsertNote(
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
    @Body(
      new ValidationPipe({
        expectedType: UpsertProblemNoteDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    dto: UpsertProblemNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.problems.upsertNote(params.slug, user.sub, dto);
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
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.problems.findBySlug(params.slug, user?.sub);
  }
}
