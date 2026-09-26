import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateTagDto } from './dto/create-tag.dto';
import { TagSlugParamDto } from './dto/tag-slug-param.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { TagsService } from './tags.service';

const validationPipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
};

@Controller('admin/tags')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminTagsController {
  constructor(@Inject(TagsService) private readonly tags: TagsService) {}

  @Get()
  list() {
    return this.tags.listAdmin();
  }

  @Post()
  create(
    @Body(
      new ValidationPipe({
        ...validationPipeOptions,
        expectedType: CreateTagDto,
      }),
    )
    dto: CreateTagDto,
  ) {
    return this.tags.createAdmin(dto);
  }

  @Patch(':slug')
  update(
    @Param(
      new ValidationPipe({
        ...validationPipeOptions,
        expectedType: TagSlugParamDto,
      }),
    )
    params: TagSlugParamDto,
    @Body(
      new ValidationPipe({
        ...validationPipeOptions,
        expectedType: UpdateTagDto,
      }),
    )
    dto: UpdateTagDto,
  ) {
    return this.tags.updateAdmin(params.slug, dto);
  }
}
