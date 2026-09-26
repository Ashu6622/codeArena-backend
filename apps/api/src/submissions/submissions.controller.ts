import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { ListSubmissionsQueryDto } from './dto/list-submissions-query.dto';
import { SubmissionActivityQueryDto } from './dto/submission-activity-query.dto';
import { SubmissionIdParamDto } from './dto/submission-id-param.dto';
import { SubmissionsService } from './submissions.service';

@Controller('submissions')
export class SubmissionsController {
  constructor(@Inject(SubmissionsService) private readonly submissions: SubmissionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(
      new ValidationPipe({
        expectedType: ListSubmissionsQueryDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    query: ListSubmissionsQueryDto,
  ) {
    return this.submissions.list(user.sub, query);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.submissions.stats(user.sub);
  }

  @Get('activity')
  @UseGuards(JwtAuthGuard)
  activity(
    @CurrentUser() user: AuthenticatedUser,
    @Query(
      new ValidationPipe({
        expectedType: SubmissionActivityQueryDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    query: SubmissionActivityQueryDto,
  ) {
    return this.submissions.activity(user.sub, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      new ValidationPipe({
        expectedType: SubmissionIdParamDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    params: SubmissionIdParamDto,
  ) {
    return this.submissions.findById(user.sub, params.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(
      new ValidationPipe({
        expectedType: CreateSubmissionDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    dto: CreateSubmissionDto,
  ) {
    return this.submissions.create(user.sub, dto);
  }
}
