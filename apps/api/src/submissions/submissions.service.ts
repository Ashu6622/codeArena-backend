import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, SubmissionStatus, Verdict } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { ListSubmissionsQueryDto } from './dto/list-submissions-query.dto';
import { SubmissionActivityQueryDto } from './dto/submission-activity-query.dto';
import { JavaScriptRunnerService } from '../execution/javascript-runner.service';

type Comparable = { comparable: string; display: string };

type JudgedTestCase = {
  testCaseId: string;
  order: number;
  isSample: boolean;
  passed: boolean;
  verdict: Verdict;
  input: string;
  expectedOutput: string;
  actualOutput?: string;
  error?: string;
  runtimeMs: number;
};

@Injectable()
export class SubmissionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(JavaScriptRunnerService) private readonly javascriptRunner: JavaScriptRunnerService,
  ) {}

  async list(userId: string, query: ListSubmissionsQueryDto) {
    const where = {
      userId,
      ...(query.problemSlug ? { problem: { slug: query.problemSlug } } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.prisma.submission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        select: {
          id: true,
          language: true,
          status: true,
          verdict: true,
          runtimeMs: true,
          memoryKb: true,
          createdAt: true,
          completedAt: true,
          problem: { select: { id: true, title: true, slug: true, difficulty: true } },
        },
      }),
      this.prisma.submission.count({ where }),
    ]);

    return {
      items: items.map((submission) => ({
        id: submission.id,
        language: submission.language,
        status: submission.status,
        verdict: submission.verdict,
        runtimeMs: submission.runtimeMs,
        memoryKb: submission.memoryKb,
        createdAt: submission.createdAt,
        completedAt: submission.completedAt,
        problem: submission.problem,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async stats(userId: string) {
    const submissions = await this.prisma.submission.findMany({
      where: { userId },
      select: { problemId: true, verdict: true },
    });
    const attemptedProblemIds = new Set<string>();
    const solvedProblemIds = new Set<string>();
    let acceptedSubmissionCount = 0;

    for (const submission of submissions) {
      attemptedProblemIds.add(submission.problemId);
      if (submission.verdict === Verdict.ACCEPTED) {
        solvedProblemIds.add(submission.problemId);
        acceptedSubmissionCount += 1;
      }
    }

    const submissionCount = submissions.length;
    const acceptanceRate =
      submissionCount === 0 ? 0 : Math.round((acceptedSubmissionCount / submissionCount) * 100);

    return {
      solvedCount: solvedProblemIds.size,
      attemptedCount: attemptedProblemIds.size,
      submissionCount,
      acceptedSubmissionCount,
      acceptanceRate,
    };
  }

  async activity(userId: string, query: SubmissionActivityQueryDto) {
    const today = this.startOfUtcDay(new Date());
    const from = this.addUtcDays(today, -(query.days - 1));
    const toExclusive = this.addUtcDays(today, 1);
    const submissions = await this.prisma.submission.findMany({
      where: {
        userId,
        createdAt: { gte: from, lt: toExclusive },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const counts = new Map<string, number>();

    for (const submission of submissions) {
      const key = this.toDateKey(submission.createdAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const days = Array.from({ length: query.days }, (_, index) => {
      const date = this.addUtcDays(from, index);
      const key = this.toDateKey(date);
      return { date: key, count: counts.get(key) ?? 0 };
    });
    const totalSubmissions = days.reduce((total, day) => total + day.count, 0);
    const maxCount = days.reduce((max, day) => Math.max(max, day.count), 0);

    return {
      from: this.toDateKey(from),
      to: this.toDateKey(today),
      totalSubmissions,
      maxCount,
      days,
    };
  }

  async findById(userId: string, id: string) {
    const submission = await this.prisma.submission.findFirst({
      where: { id, userId },
      select: {
        id: true,
        language: true,
        sourceCode: true,
        status: true,
        verdict: true,
        runtimeMs: true,
        memoryKb: true,
        compileOutput: true,
        runtimeError: true,
        createdAt: true,
        completedAt: true,
        problem: {
          select: {
            id: true,
            title: true,
            slug: true,
            difficulty: true,
            timeLimitMs: true,
            memoryLimitMb: true,
          },
        },
      },
    });

    if (!submission) throw new NotFoundException('Submission not found');

    return submission;
  }

  async create(userId: string, dto: CreateSubmissionDto) {
    if (dto.language !== Language.JAVASCRIPT) {
      throw new BadRequestException('Only JavaScript submissions are supported in V1');
    }

    const problem = await this.prisma.problem.findFirst({
      where: { slug: dto.problemSlug, isPublished: true },
      select: {
        id: true,
        title: true,
        slug: true,
        timeLimitMs: true,
        memoryLimitMb: true,
        languages: {
          where: { language: dto.language },
          select: { language: true, functionSignature: true },
          take: 1,
        },
        testCases: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, input: true, expectedOutput: true, isSample: true, order: true },
        },
      },
    });

    if (!problem) throw new NotFoundException('Problem not found');

    const languageConfig = problem.languages[0];
    if (!languageConfig) throw new BadRequestException('Language is not enabled for this problem');
    if (!languageConfig.functionSignature) {
      throw new BadRequestException('Problem language is missing a function signature');
    }
    if (problem.testCases.length === 0) {
      throw new BadRequestException('Problem does not have test cases');
    }

    const signature = this.parseFunctionSignature(languageConfig.functionSignature);
    const preparedTestCases = problem.testCases.map((testCase) => ({
      ...testCase,
      args: this.createArguments(testCase.input, signature.argumentNames),
      expected: this.normalize(testCase.expectedOutput),
    }));
    const timeoutMs = Math.min(
      problem.timeLimitMs,
      this.config.getOrThrow<number>('execution.timeoutMs'),
    );
    const memoryLimitMb = Math.min(
      problem.memoryLimitMb,
      this.config.getOrThrow<number>('execution.memoryLimitMb'),
    );
    const maxOutputBytes = this.config.getOrThrow<number>('execution.maxOutputBytes');

    const submission = await this.prisma.submission.create({
      data: {
        userId,
        problemId: problem.id,
        language: dto.language,
        sourceCode: dto.code,
        status: SubmissionStatus.RUNNING,
      },
      select: { id: true, createdAt: true },
    });

    const results: JudgedTestCase[] = [];
    for (const testCase of preparedTestCases) {
      const result = await this.javascriptRunner.run({
        code: dto.code,
        functionName: signature.functionName,
        args: testCase.args,
        timeoutMs,
        memoryLimitMb,
        maxOutputBytes,
      });
      const passed =
        result.verdict === Verdict.ACCEPTED && result.actualOutput === testCase.expected.comparable;
      results.push({
        testCaseId: testCase.id,
        order: testCase.order,
        isSample: testCase.isSample,
        passed,
        verdict: passed
          ? Verdict.ACCEPTED
          : result.verdict === Verdict.ACCEPTED
            ? Verdict.WRONG_ANSWER
            : result.verdict,
        input: testCase.input,
        expectedOutput: testCase.expected.display,
        actualOutput: result.actualOutput,
        error: result.error,
        runtimeMs: result.runtimeMs,
      });
    }

    const passedCount = results.filter((result) => result.passed).length;
    const verdict = this.resolveVerdict(results.map((result) => result.verdict));
    const firstError = results.find((result) => result.error)?.error;
    const completed = await this.prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: SubmissionStatus.COMPLETED,
        verdict,
        runtimeMs: results.reduce((total, result) => total + result.runtimeMs, 0),
        runtimeError: firstError,
        completedAt: new Date(),
      },
      select: {
        status: true,
        verdict: true,
        runtimeMs: true,
        memoryKb: true,
        runtimeError: true,
        completedAt: true,
      },
    });

    const sampleResults = results
      .filter((result) => result.isSample)
      .map((result) => ({
        testCaseId: result.testCaseId,
        order: result.order,
        passed: result.passed,
        verdict: result.verdict,
        input: result.input,
        expectedOutput: result.expectedOutput,
        actualOutput: result.actualOutput,
        error: result.error,
        runtimeMs: result.runtimeMs,
      }));
    const hiddenResults = results.filter((result) => !result.isSample);

    return {
      submission: {
        id: submission.id,
        status: completed.status,
        verdict: completed.verdict,
        runtimeMs: completed.runtimeMs,
        memoryKb: completed.memoryKb,
        runtimeError: completed.runtimeError,
        createdAt: submission.createdAt,
        completedAt: completed.completedAt,
      },
      problem: {
        id: problem.id,
        title: problem.title,
        slug: problem.slug,
        language: dto.language,
      },
      verdict,
      passed: verdict === Verdict.ACCEPTED,
      passedCount,
      totalCount: results.length,
      sampleResults,
      hiddenResults: {
        passedCount: hiddenResults.filter((result) => result.passed).length,
        totalCount: hiddenResults.length,
      },
    };
  }

  private startOfUtcDay(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private addUtcDays(value: Date, days: number): Date {
    const next = new Date(value);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private toDateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private parseFunctionSignature(signature: string): {
    functionName: string;
    argumentNames: string[];
  } {
    const match = signature.match(/^([A-Za-z_$][\w$]*)\(([^)]*)\)/);
    if (!match) throw new BadRequestException('Invalid function signature');
    const argumentNames = match[2]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split(':')[0].trim());

    if (argumentNames.some((name) => !/^[A-Za-z_$][\w$]*$/.test(name))) {
      throw new BadRequestException('Invalid function signature arguments');
    }

    return { functionName: match[1], argumentNames };
  }

  private createArguments(input: string, argumentNames: string[]): unknown[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      throw new BadRequestException('Test case input is not valid JSON');
    }

    if (argumentNames.length === 1) {
      if (this.isPlainObject(parsed) && argumentNames[0] in parsed)
        return [parsed[argumentNames[0]]];
      return [parsed];
    }

    if (!this.isPlainObject(parsed))
      throw new BadRequestException('Test case input must be a JSON object');
    return argumentNames.map((name) => parsed[name]);
  }

  private normalize(value: string): Comparable {
    try {
      const parsed = JSON.parse(value);
      return { comparable: JSON.stringify(parsed), display: JSON.stringify(parsed) };
    } catch {
      return { comparable: value, display: value };
    }
  }

  private resolveVerdict(verdicts: Verdict[]): Verdict {
    const priority = [
      Verdict.COMPILE_ERROR,
      Verdict.TIME_LIMIT_EXCEEDED,
      Verdict.RUNTIME_ERROR,
      Verdict.WRONG_ANSWER,
      Verdict.ACCEPTED,
    ];
    return priority.find((verdict) => verdicts.includes(verdict)) ?? Verdict.INTERNAL_ERROR;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
