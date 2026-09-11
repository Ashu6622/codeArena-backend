import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, Verdict } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RunCodeDto } from './dto/run-code.dto';
import { JavaScriptRunnerService } from './javascript-runner.service';

type Comparable = { comparable: string; display: string };

@Injectable()
export class ExecutionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(JavaScriptRunnerService) private readonly javascriptRunner: JavaScriptRunnerService,
  ) {}

  async run(dto: RunCodeDto) {
    if (dto.language !== Language.JAVASCRIPT) {
      throw new BadRequestException('Only JavaScript execution is supported in V1');
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
          where: { isSample: true },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, input: true, expectedOutput: true, order: true },
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
      throw new BadRequestException('Problem does not have sample test cases');
    }

    const signature = this.parseFunctionSignature(languageConfig.functionSignature);
    const timeoutMs = Math.min(
      problem.timeLimitMs,
      this.config.getOrThrow<number>('execution.timeoutMs'),
    );
    const memoryLimitMb = Math.min(
      problem.memoryLimitMb,
      this.config.getOrThrow<number>('execution.memoryLimitMb'),
    );
    const maxOutputBytes = this.config.getOrThrow<number>('execution.maxOutputBytes');

    const results = [];
    for (const testCase of problem.testCases) {
      const args = this.createArguments(testCase.input, signature.argumentNames);
      const expected = this.normalize(testCase.expectedOutput);
      const result = await this.javascriptRunner.run({
        code: dto.code,
        functionName: signature.functionName,
        args,
        timeoutMs,
        memoryLimitMb,
        maxOutputBytes,
      });
      const passed =
        result.verdict === Verdict.ACCEPTED && result.actualOutput === expected.comparable;
      results.push({
        testCaseId: testCase.id,
        order: testCase.order,
        passed,
        verdict: passed
          ? Verdict.ACCEPTED
          : result.verdict === Verdict.ACCEPTED
            ? Verdict.WRONG_ANSWER
            : result.verdict,
        input: testCase.input,
        expectedOutput: expected.display,
        actualOutput: result.actualOutput,
        error: result.error,
        runtimeMs: result.runtimeMs,
      });
    }

    const passedCount = results.filter((result) => result.passed).length;
    const verdict = this.resolveVerdict(results.map((result) => result.verdict));

    return {
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
      runtimeMs: results.reduce((total, result) => total + result.runtimeMs, 0),
      results,
    };
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
      throw new BadRequestException('Sample input is not valid JSON');
    }

    if (argumentNames.length === 1) {
      if (this.isPlainObject(parsed) && argumentNames[0] in parsed)
        return [parsed[argumentNames[0]]];
      return [parsed];
    }

    if (!this.isPlainObject(parsed))
      throw new BadRequestException('Sample input must be a JSON object');
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
