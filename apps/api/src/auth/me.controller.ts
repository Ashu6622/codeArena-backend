import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { Verdict } from '@prisma/client';
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

  private progressStatus(submissions: { verdict: Verdict | null }[]) {
    if (submissions.some((submission) => submission.verdict === Verdict.ACCEPTED)) return 'SOLVED';
    if (submissions.length > 0) return 'ATTEMPTED';
    return 'NOT_STARTED';
  }
}
