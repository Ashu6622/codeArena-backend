import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Verdict } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminListProblemsQueryDto } from './dto/admin-list-problems-query.dto';
import { CreateProblemCommentDto } from './dto/create-problem-comment.dto';
import {
  CreateProblemDto,
  CreateProblemLanguageDto,
  CreateTestCaseDto,
} from './dto/create-problem.dto';
import { ListProblemsQueryDto, type ProblemProgressStatus } from './dto/list-problems-query.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import { UpsertProblemNoteDto } from './dto/upsert-problem-note.dto';

type ProblemTagProjection = { tag: { id: string; name: string; slug: string } };

@Injectable()
export class ProblemsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: ListProblemsQueryDto, userId?: string) {
    if (query.bookmarked !== undefined && !userId) {
      throw new BadRequestException('Bookmark filters require authentication');
    }

    const where: Prisma.ProblemWhereInput = {
      isPublished: true,
      ...(query.difficulty && { difficulty: query.difficulty }),
      ...(query.language && { languages: { some: { language: query.language } } }),
      ...(query.tag && { tags: { some: { tag: { slug: query.tag } } } }),
      ...(userId &&
        query.bookmarked !== undefined && {
          bookmarks: query.bookmarked ? { some: { userId } } : { none: { userId } },
        }),
      ...(userId && query.progressStatus && this.createProgressWhere(query.progressStatus, userId)),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' as const } },
          { slug: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const skip = (query.page - 1) * query.limit;

    const [problems, total] = await Promise.all([
      this.prisma.problem.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ difficulty: 'asc' }, { title: 'asc' }],
        select: {
          id: true,
          title: true,
          slug: true,
          difficulty: true,
          timeLimitMs: true,
          memoryLimitMb: true,
          languages: { select: { language: true }, orderBy: { language: 'asc' } },
          tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
        },
      }),
      this.prisma.problem.count({ where }),
    ]);

    const problemIds = problems.map((problem) => problem.id);
    const [progressByProblemId, bookmarkedProblemIds] = await Promise.all([
      this.getProgressByProblemId(problemIds, userId),
      this.getBookmarkedProblemIds(problemIds, userId),
    ]);

    return {
      items: problems.map((problem) => ({
        ...problem,
        languages: problem.languages.map((item) => item.language),
        tags: this.formatTags(problem.tags),
        progressStatus: this.getProgressStatus(problem.id, progressByProblemId, userId),
        isBookmarked: bookmarkedProblemIds.has(problem.id),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async listAdmin(query: AdminListProblemsQueryDto) {
    const where: Prisma.ProblemWhereInput = {
      ...(query.isPublished !== undefined && { isPublished: query.isPublished }),
      ...(query.difficulty && { difficulty: query.difficulty }),
      ...(query.language && { languages: { some: { language: query.language } } }),
      ...(query.tag && { tags: { some: { tag: { slug: query.tag } } } }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' as const } },
          { slug: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const skip = (query.page - 1) * query.limit;

    const [problems, total] = await Promise.all([
      this.prisma.problem.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
        select: {
          id: true,
          title: true,
          slug: true,
          difficulty: true,
          timeLimitMs: true,
          memoryLimitMb: true,
          isPublished: true,
          createdAt: true,
          updatedAt: true,
          languages: { select: { language: true }, orderBy: { language: 'asc' } },
          tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
          _count: { select: { testCases: true, submissions: true } },
        },
      }),
      this.prisma.problem.count({ where }),
    ]);

    return {
      items: problems.map((problem) => ({
        id: problem.id,
        title: problem.title,
        slug: problem.slug,
        difficulty: problem.difficulty,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        isPublished: problem.isPublished,
        createdAt: problem.createdAt,
        updatedAt: problem.updatedAt,
        languages: problem.languages.map((item) => item.language),
        tags: this.formatTags(problem.tags),
        testCaseCount: problem._count.testCases,
        submissionCount: problem._count.submissions,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findBySlug(slug: string, userId?: string) {
    const problem = await this.prisma.problem.findFirst({
      where: { slug, isPublished: true },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        difficulty: true,
        timeLimitMs: true,
        memoryLimitMb: true,
        languages: {
          orderBy: { language: 'asc' },
          select: {
            language: true,
            starterCode: true,
            functionSignature: true,
          },
        },
        tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
        testCases: {
          where: { isSample: true },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, input: true, expectedOutput: true, order: true },
        },
      },
    });

    if (!problem) throw new NotFoundException('Problem not found');
    const [progressByProblemId, bookmarkedProblemIds] = await Promise.all([
      this.getProgressByProblemId([problem.id], userId),
      this.getBookmarkedProblemIds([problem.id], userId),
    ]);
    return {
      ...problem,
      tags: this.formatTags(problem.tags),
      progressStatus: this.getProgressStatus(problem.id, progressByProblemId, userId),
      isBookmarked: bookmarkedProblemIds.has(problem.id),
    };
  }

  async bookmark(slug: string, userId: string) {
    const problem = await this.findPublishedProblemForUserState(slug);
    const bookmark = await this.prisma.problemBookmark.upsert({
      where: { userId_problemId: { userId, problemId: problem.id } },
      update: {},
      create: { userId, problemId: problem.id },
      select: { id: true, createdAt: true },
    });

    return {
      problem: { id: problem.id, title: problem.title, slug: problem.slug },
      isBookmarked: true,
      bookmark,
    };
  }

  async unbookmark(slug: string, userId: string) {
    const problem = await this.findPublishedProblemForUserState(slug);
    await this.prisma.problemBookmark.deleteMany({
      where: { userId, problemId: problem.id },
    });

    return {
      problem: { id: problem.id, title: problem.title, slug: problem.slug },
      isBookmarked: false,
    };
  }

  async listComments(slug: string) {
    const problem = await this.findPublishedProblemForUserState(slug);
    const comments = await this.prisma.problemComment.findMany({
      where: { problemId: problem.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true } },
      },
    });

    return {
      problem: { id: problem.id, title: problem.title, slug: problem.slug },
      items: comments.map((comment) => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: comment.user,
      })),
    };
  }

  async createComment(slug: string, userId: string, dto: CreateProblemCommentDto) {
    const problem = await this.findPublishedProblemForUserState(slug);
    const comment = await this.prisma.problemComment.create({
      data: { userId, problemId: problem.id, content: dto.content },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true } },
      },
    });

    return {
      problem: { id: problem.id, title: problem.title, slug: problem.slug },
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: comment.user,
      },
    };
  }

  async getNote(slug: string, userId: string) {
    const problem = await this.findPublishedProblemForUserState(slug);
    const note = await this.prisma.problemNote.findUnique({
      where: { userId_problemId: { userId, problemId: problem.id } },
      select: { id: true, content: true, createdAt: true, updatedAt: true },
    });

    return {
      problem: { id: problem.id, title: problem.title, slug: problem.slug },
      note,
    };
  }

  async upsertNote(slug: string, userId: string, dto: UpsertProblemNoteDto) {
    const problem = await this.findPublishedProblemForUserState(slug);
    const note = await this.prisma.problemNote.upsert({
      where: { userId_problemId: { userId, problemId: problem.id } },
      update: { content: dto.content },
      create: { userId, problemId: problem.id, content: dto.content },
      select: { id: true, content: true, createdAt: true, updatedAt: true },
    });

    return {
      problem: { id: problem.id, title: problem.title, slug: problem.slug },
      note,
    };
  }

  async create(dto: CreateProblemDto, createdById: string) {
    this.validateLanguageConfigs(dto.languages);
    this.validateTestCases(dto.testCases);

    try {
      const problem = await this.prisma.problem.create({
        data: {
          title: dto.title,
          slug: dto.slug,
          description: dto.description,
          difficulty: dto.difficulty,
          timeLimitMs: dto.timeLimitMs,
          memoryLimitMb: dto.memoryLimitMb,
          isPublished: dto.isPublished ?? false,
          createdById,
          languages: { create: dto.languages },
          ...(this.createTagConnections(dto.tagSlugs) && {
            tags: this.createTagConnections(dto.tagSlugs),
          }),
          testCases: {
            create: dto.testCases.map((testCase, index) => ({
              ...testCase,
              order: testCase.order ?? index,
            })),
          },
        },
        select: {
          id: true,
          title: true,
          slug: true,
          difficulty: true,
          isPublished: true,
          createdAt: true,
          languages: { select: { language: true } },
          tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
          _count: { select: { testCases: true } },
        },
      });

      return {
        id: problem.id,
        title: problem.title,
        slug: problem.slug,
        difficulty: problem.difficulty,
        isPublished: problem.isPublished,
        createdAt: problem.createdAt,
        languages: problem.languages.map((item) => item.language),
        tags: this.formatTags(problem.tags),
        testCaseCount: problem._count.testCases,
        sampleTestCaseCount: dto.testCases.filter((testCase) => testCase.isSample).length,
        hiddenTestCaseCount: dto.testCases.filter((testCase) => !testCase.isSample).length,
      };
    } catch (error) {
      this.handleKnownProblemWriteError(error);
    }
  }

  async findAdminBySlug(slug: string) {
    const problem = await this.prisma.problem.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        difficulty: true,
        timeLimitMs: true,
        memoryLimitMb: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        languages: {
          orderBy: { language: 'asc' },
          select: {
            language: true,
            starterCode: true,
            functionSignature: true,
            executionTemplate: true,
          },
        },
        tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
        testCases: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            input: true,
            expectedOutput: true,
            isSample: true,
            order: true,
          },
        },
      },
    });

    if (!problem) throw new NotFoundException('Problem not found');
    return { ...problem, tags: this.formatTags(problem.tags) };
  }

  async archiveAdmin(slug: string) {
    const existing = await this.prisma.problem.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Problem not found');

    const problem = await this.prisma.problem.update({
      where: { id: existing.id },
      data: { isPublished: false },
      select: {
        id: true,
        title: true,
        slug: true,
        difficulty: true,
        isPublished: true,
        updatedAt: true,
        languages: { select: { language: true } },
        tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
        testCases: { select: { isSample: true } },
      },
    });

    return {
      id: problem.id,
      title: problem.title,
      slug: problem.slug,
      difficulty: problem.difficulty,
      isPublished: problem.isPublished,
      updatedAt: problem.updatedAt,
      languages: problem.languages.map((item) => item.language),
      tags: this.formatTags(problem.tags),
      testCaseCount: problem.testCases.length,
      sampleTestCaseCount: problem.testCases.filter((testCase) => testCase.isSample).length,
      hiddenTestCaseCount: problem.testCases.filter((testCase) => !testCase.isSample).length,
    };
  }

  async updateAdmin(slug: string, dto: UpdateProblemDto) {
    if (dto.languages) this.validateLanguageConfigs(dto.languages);
    if (dto.testCases) this.validateTestCases(dto.testCases);

    const existing = await this.prisma.problem.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Problem not found');

    try {
      const problem = await this.prisma.problem.update({
        where: { id: existing.id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.slug !== undefined && { slug: dto.slug }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.difficulty !== undefined && { difficulty: dto.difficulty }),
          ...(dto.timeLimitMs !== undefined && { timeLimitMs: dto.timeLimitMs }),
          ...(dto.memoryLimitMb !== undefined && { memoryLimitMb: dto.memoryLimitMb }),
          ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
          ...(dto.tagSlugs !== undefined && { tags: this.replaceTagConnections(dto.tagSlugs) }),
          ...(dto.languages && {
            languages: {
              deleteMany: {},
              create: dto.languages,
            },
          }),
          ...(dto.testCases && {
            testCases: {
              deleteMany: {},
              create: dto.testCases.map((testCase, index) => ({
                ...testCase,
                order: testCase.order ?? index,
              })),
            },
          }),
        },
        select: {
          id: true,
          title: true,
          slug: true,
          difficulty: true,
          isPublished: true,
          updatedAt: true,
          languages: { select: { language: true } },
          tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
          testCases: { select: { isSample: true } },
        },
      });

      return {
        id: problem.id,
        title: problem.title,
        slug: problem.slug,
        difficulty: problem.difficulty,
        isPublished: problem.isPublished,
        updatedAt: problem.updatedAt,
        languages: problem.languages.map((item) => item.language),
        tags: this.formatTags(problem.tags),
        testCaseCount: problem.testCases.length,
        sampleTestCaseCount: problem.testCases.filter((testCase) => testCase.isSample).length,
        hiddenTestCaseCount: problem.testCases.filter((testCase) => !testCase.isSample).length,
      };
    } catch (error) {
      this.handleKnownProblemWriteError(error);
    }
  }

  private async getBookmarkedProblemIds(problemIds: string[], userId?: string) {
    if (!userId || problemIds.length === 0) return new Set<string>();
    const bookmarks = await this.prisma.problemBookmark.findMany({
      where: { userId, problemId: { in: problemIds } },
      select: { problemId: true },
    });
    return new Set(bookmarks.map((bookmark) => bookmark.problemId));
  }

  private async findPublishedProblemForUserState(slug: string) {
    const problem = await this.prisma.problem.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, title: true, slug: true },
    });
    if (!problem) throw new NotFoundException('Problem not found');
    return problem;
  }

  private createProgressWhere(
    progressStatus: ProblemProgressStatus,
    userId: string,
  ): Prisma.ProblemWhereInput {
    if (progressStatus === 'SOLVED') {
      return { submissions: { some: { userId, verdict: Verdict.ACCEPTED } } };
    }
    if (progressStatus === 'ATTEMPTED') {
      return {
        AND: [
          { submissions: { some: { userId } } },
          { submissions: { none: { userId, verdict: Verdict.ACCEPTED } } },
        ],
      };
    }
    return { submissions: { none: { userId } } };
  }

  private async getProgressByProblemId(problemIds: string[], userId?: string) {
    const progressByProblemId = new Map<string, ProblemProgressStatus>();
    if (!userId || problemIds.length === 0) return progressByProblemId;

    const submissions = await this.prisma.submission.findMany({
      where: { userId, problemId: { in: problemIds } },
      select: { problemId: true, verdict: true },
    });

    for (const submission of submissions) {
      if (submission.verdict === Verdict.ACCEPTED) {
        progressByProblemId.set(submission.problemId, 'SOLVED');
      } else if (progressByProblemId.get(submission.problemId) !== 'SOLVED') {
        progressByProblemId.set(submission.problemId, 'ATTEMPTED');
      }
    }

    return progressByProblemId;
  }

  private getProgressStatus(
    problemId: string,
    progressByProblemId: Map<string, ProblemProgressStatus>,
    userId?: string,
  ) {
    if (!userId) return undefined;
    return progressByProblemId.get(problemId) ?? 'NOT_STARTED';
  }

  private createTagConnections(tagSlugs?: string[]) {
    const uniqueSlugs = Array.from(new Set(tagSlugs ?? []));
    if (uniqueSlugs.length === 0) return undefined;
    return {
      create: uniqueSlugs.map((slug) => ({
        tag: { connect: { slug } },
      })),
    };
  }

  private replaceTagConnections(tagSlugs: string[]) {
    const uniqueSlugs = Array.from(new Set(tagSlugs));
    return {
      deleteMany: {},
      ...(uniqueSlugs.length > 0 && {
        create: uniqueSlugs.map((slug) => ({
          tag: { connect: { slug } },
        })),
      }),
    };
  }

  private formatTags(tags: ProblemTagProjection[]) {
    return tags.map((item) => item.tag).sort((left, right) => left.name.localeCompare(right.name));
  }

  private handleKnownProblemWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A problem with this slug already exists');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new BadRequestException('One or more problem tags do not exist');
    }
    throw error;
  }

  private validateLanguageConfigs(languages: CreateProblemLanguageDto[]) {
    const languageSet = new Set(languages.map((item) => item.language));
    if (languageSet.size !== languages.length) {
      throw new BadRequestException('Each language can be configured only once');
    }
  }

  private validateTestCases(testCases: CreateTestCaseDto[]) {
    if (!testCases.some((testCase) => testCase.isSample)) {
      throw new BadRequestException('At least one sample test case is required');
    }
    if (!testCases.some((testCase) => !testCase.isSample)) {
      throw new BadRequestException('At least one hidden test case is required');
    }
  }
}
