import { Inject, Injectable } from '@nestjs/common';
import { SubmissionStatus, Verdict } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';

type LeaderboardAccumulator = {
  userId: string;
  name: string | null;
  email: string;
  solvedProblems: Set<string>;
  acceptedSubmissions: number;
  latestAcceptedAt: Date;
};

export type LeaderboardEntry = {
  rank: number;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  solvedCount: number;
  acceptedSubmissionCount: number;
  latestAcceptedAt: Date;
};

@Injectable()
export class LeaderboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: LeaderboardQueryDto) {
    const submissions = await this.prisma.submission.findMany({
      where: {
        status: SubmissionStatus.COMPLETED,
        verdict: Verdict.ACCEPTED,
        problem: { isPublished: true },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        problemId: true,
        createdAt: true,
        completedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const users = new Map<string, LeaderboardAccumulator>();

    for (const submission of submissions) {
      const acceptedAt = submission.completedAt ?? submission.createdAt;
      const existing = users.get(submission.user.id);

      if (!existing) {
        users.set(submission.user.id, {
          userId: submission.user.id,
          name: submission.user.name,
          email: submission.user.email,
          solvedProblems: new Set([submission.problemId]),
          acceptedSubmissions: 1,
          latestAcceptedAt: acceptedAt,
        });
        continue;
      }

      existing.solvedProblems.add(submission.problemId);
      existing.acceptedSubmissions += 1;
      if (acceptedAt > existing.latestAcceptedAt) existing.latestAcceptedAt = acceptedAt;
    }

    const items: LeaderboardEntry[] = Array.from(users.values())
      .map((user) => ({
        rank: 0,
        user: {
          id: user.userId,
          name: user.name,
          email: user.email,
        },
        solvedCount: user.solvedProblems.size,
        acceptedSubmissionCount: user.acceptedSubmissions,
        latestAcceptedAt: user.latestAcceptedAt,
      }))
      .sort((left, right) => {
        if (right.solvedCount !== left.solvedCount) return right.solvedCount - left.solvedCount;
        if (right.acceptedSubmissionCount !== left.acceptedSubmissionCount) {
          return right.acceptedSubmissionCount - left.acceptedSubmissionCount;
        }
        return right.latestAcceptedAt.getTime() - left.latestAcceptedAt.getTime();
      })
      .slice(0, query.limit)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    return {
      items,
      totalRankedUsers: users.size,
      generatedAt: new Date(),
    };
  }
}
