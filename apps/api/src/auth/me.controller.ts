import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Verdict } from '@prisma/client';
import { ProblemSlugParamDto } from '../problems/dto/problem-slug-param.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './auth.types';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('bookmarks')
  async bookmarks(@CurrentUser() user: AuthenticatedUser) {
    const bookmarks = await this.prisma.problemBookmark.findMany({
      where: { userId: user.sub, problem: { isPublished: true } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        problem: {
          select: {
            id: true,
            title: true,
            slug: true,
            difficulty: true,
            timeLimitMs: true,
            memoryLimitMb: true,
            tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
            submissions: {
              where: { userId: user.sub },
              select: { verdict: true },
            },
          },
        },
      },
    });

    return {
      items: bookmarks.map((bookmark) => ({
        id: bookmark.problem.id,
        title: bookmark.problem.title,
        slug: bookmark.problem.slug,
        difficulty: bookmark.problem.difficulty,
        timeLimitMs: bookmark.problem.timeLimitMs,
        memoryLimitMb: bookmark.problem.memoryLimitMb,
        bookmarkedAt: bookmark.createdAt,
        progressStatus: this.progressStatus(bookmark.problem.submissions),
        tags: bookmark.problem.tags.map(({ tag }) => tag),
      })),
    };
  }

  @Get('notes')
  async notes(@CurrentUser() user: AuthenticatedUser) {
    const notes = await this.prisma.problemNote.findMany({
      where: { userId: user.sub, problem: { isPublished: true } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        problem: {
          select: {
            id: true,
            title: true,
            slug: true,
            difficulty: true,
            tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
            submissions: {
              where: { userId: user.sub },
              select: { verdict: true },
            },
          },
        },
      },
    });

    return {
      items: notes.map((note) => ({
        id: note.id,
        contentPreview: this.preview(note.content),
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        problem: {
          id: note.problem.id,
          title: note.problem.title,
          slug: note.problem.slug,
          difficulty: note.problem.difficulty,
          progressStatus: this.progressStatus(note.problem.submissions),
          tags: note.problem.tags.map(({ tag }) => tag),
        },
      })),
    };
  }

  @Get('notes/:slug')
  async note(
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
    const note = await this.prisma.problemNote.findFirst({
      where: { userId: user.sub, problem: { slug: params.slug, isPublished: true } },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        problem: {
          select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            difficulty: true,
            timeLimitMs: true,
            memoryLimitMb: true,
            tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
            submissions: {
              where: { userId: user.sub },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                language: true,
                sourceCode: true,
                status: true,
                verdict: true,
                runtimeMs: true,
                createdAt: true,
                completedAt: true,
              },
            },
          },
        },
      },
    });

    if (!note) throw new NotFoundException('Problem note not found');
    const latestSubmission = note.problem.submissions[0] ?? null;

    return {
      note: {
        id: note.id,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      },
      problem: {
        id: note.problem.id,
        title: note.problem.title,
        slug: note.problem.slug,
        description: note.problem.description,
        difficulty: note.problem.difficulty,
        timeLimitMs: note.problem.timeLimitMs,
        memoryLimitMb: note.problem.memoryLimitMb,
        tags: note.problem.tags.map(({ tag }) => tag),
      },
      latestSubmission,
    };
  }

  private progressStatus(submissions: { verdict: Verdict | null }[]) {
    if (submissions.some((submission) => submission.verdict === Verdict.ACCEPTED)) return 'SOLVED';
    if (submissions.length > 0) return 'ATTEMPTED';
    return 'NOT_STARTED';
  }

  private preview(content: string) {
    const compact = content.trim().replace(/\s+/g, ' ');
    if (compact.length <= 140) return compact;
    return compact.slice(0, 137) + '...';
  }
}
