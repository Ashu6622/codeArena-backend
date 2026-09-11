import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProblemDto } from './dto/create-problem.dto';
import { ListProblemsQueryDto } from './dto/list-problems-query.dto';

@Injectable()
export class ProblemsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: ListProblemsQueryDto) {
    const where: Prisma.ProblemWhereInput = {
      isPublished: true,
      ...(query.difficulty && { difficulty: query.difficulty }),
      ...(query.language && { languages: { some: { language: query.language } } }),
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
        },
      }),
      this.prisma.problem.count({ where }),
    ]);

    return {
      items: problems.map((problem) => ({
        ...problem,
        languages: problem.languages.map((item) => item.language),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findBySlug(slug: string) {
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
        testCases: {
          where: { isSample: true },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, input: true, expectedOutput: true, order: true },
        },
      },
    });

    if (!problem) throw new NotFoundException('Problem not found');
    return problem;
  }

  async create(dto: CreateProblemDto, createdById: string) {
    const languages = new Set(dto.languages.map((item) => item.language));
    if (languages.size !== dto.languages.length) {
      throw new BadRequestException('Each language can be configured only once');
    }

    if (!dto.testCases.some((testCase) => testCase.isSample)) {
      throw new BadRequestException('At least one sample test case is required');
    }
    if (!dto.testCases.some((testCase) => !testCase.isSample)) {
      throw new BadRequestException('At least one hidden test case is required');
    }

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
        testCaseCount: problem._count.testCases,
        sampleTestCaseCount: dto.testCases.filter((testCase) => testCase.isSample).length,
        hiddenTestCaseCount: dto.testCases.filter((testCase) => !testCase.isSample).length,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A problem with this slug already exists');
      }
      throw error;
    }
  }
}
