import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SubmissionStatus, Verdict } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PublicSubmission = {
  problemId: string;
  verdict: Verdict | null;
  createdAt: Date;
  completedAt: Date | null;
  problem: {
    id: string;
    title: string;
    slug: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    tags: { tag: { id: string; name: string; slug: string } }[];
  };
};

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async publicProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        submissions: {
          where: {
            status: SubmissionStatus.COMPLETED,
            problem: { isPublished: true },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            problemId: true,
            verdict: true,
            createdAt: true,
            completedAt: true,
            problem: {
              select: {
                id: true,
                title: true,
                slug: true,
                difficulty: true,
                tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
              },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const solvedProblemIds = new Set<string>();
    const attemptedProblemIds = new Set<string>();
    let acceptedSubmissionCount = 0;
    const recentAcceptedProblems = new Map<string, PublicSubmission>();

    for (const submission of user.submissions) {
      attemptedProblemIds.add(submission.problemId);

      if (submission.verdict !== Verdict.ACCEPTED) continue;
      acceptedSubmissionCount += 1;
      solvedProblemIds.add(submission.problemId);

      const acceptedAt = submission.completedAt ?? submission.createdAt;
      const existing = recentAcceptedProblems.get(submission.problemId);
      const existingAcceptedAt = existing ? (existing.completedAt ?? existing.createdAt) : null;
      if (!existing || (existingAcceptedAt && acceptedAt > existingAcceptedAt)) {
        recentAcceptedProblems.set(submission.problemId, submission);
      }
    }

    const recentSolved = Array.from(recentAcceptedProblems.values())
      .sort(
        (left, right) =>
          (right.completedAt ?? right.createdAt).getTime() -
          (left.completedAt ?? left.createdAt).getTime(),
      )
      .slice(0, 5)
      .map((submission) => ({
        id: submission.problem.id,
        title: submission.problem.title,
        slug: submission.problem.slug,
        difficulty: submission.problem.difficulty,
        solvedAt: submission.completedAt ?? submission.createdAt,
        tags: submission.problem.tags.map(({ tag }) => tag),
      }));

    return {
      user: {
        id: user.id,
        name: user.name,
        joinedAt: user.createdAt,
      },
      stats: {
        solvedCount: solvedProblemIds.size,
        attemptedCount: attemptedProblemIds.size,
        acceptedSubmissionCount,
      },
      recentSolved,
    };
  }
}
