import { Injectable, Logger } from '@nestjs/common';
import { Verdict } from '@prisma/client';
import { exec, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodeExecutor, ExecutionRequest, ExecutionResult } from './code-executor.interface';

const MAX_OUTPUT_BYTES = 65536; // 64KB stdout/stderr cap

@Injectable()
export class DockerCodeExecutorService implements CodeExecutor {
  private readonly logger = new Logger(DockerCodeExecutorService.name);

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const executionId = randomUUID();
    const workspaceDir = path.join(os.tmpdir(), 'codearena', executionId);
    const containerName = `codearena-runner-${executionId}`;

    let timedOut = false;
    let stdoutData = '';
    let stderrData = '';
    const startTime = Date.now();

    try {
      // 1. Create temporary workspace directory (Milestone D3)
      fs.mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });

      const filename = this.getFilenameForLanguage(request.language);
      fs.writeFileSync(path.join(workspaceDir, filename), request.sourceCode, 'utf8');

      if (request.stdin !== undefined) {
        fs.writeFileSync(path.join(workspaceDir, 'input.txt'), request.stdin, 'utf8');
      }

      // 2. Select runner image
      const image = this.getDockerImageForLanguage(request.language);
      const memoryLimitMb = request.memoryLimitMb || 128;
      const timeoutMs = request.timeLimitMs || 3000;

      // 3. Construct Docker command with security isolation flags (Milestones D6-D10)
      const dockerArgs = [
        'run',
        '--rm',
        '--name',
        containerName,
        '--network',
        'none',
        '--memory',
        `${memoryLimitMb}m`,
        '--cpus',
        '0.5',
        '--pids-limit',
        '64',
        '--read-only',
        '--security-opt',
        'no-new-privileges',
        '-v',
        `${workspaceDir}:/workspace:ro`,
        image,
      ];

      return await new Promise<ExecutionResult>((resolve) => {
        let timer: NodeJS.Timeout | null = null;

        const child = spawn('docker', dockerArgs, {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Host Wall-Clock Timeout Enforcement (Milestone D5)
        timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
          exec(`docker rm -f ${containerName}`, () => {});
        }, timeoutMs + 1000);

        child.stdout.on('data', (chunk: Buffer) => {
          if (stdoutData.length < MAX_OUTPUT_BYTES) {
            stdoutData += chunk.toString('utf8');
            if (stdoutData.length > MAX_OUTPUT_BYTES) {
              stdoutData =
                stdoutData.slice(0, MAX_OUTPUT_BYTES) + '\n[Output truncated - 64KB limit reached]';
            }
          }
        });

        child.stderr.on('data', (chunk: Buffer) => {
          if (stderrData.length < MAX_OUTPUT_BYTES) {
            stderrData += chunk.toString('utf8');
            if (stderrData.length > MAX_OUTPUT_BYTES) {
              stderrData = stderrData.slice(0, MAX_OUTPUT_BYTES) + '\n[Error output truncated]';
            }
          }
        });

        child.on('error', (err) => {
          if (timer) clearTimeout(timer);
          this.logger.warn(`Docker execution error/fallback for ${executionId}: ${err.message}`);
          resolve({
            stdout: '',
            stderr: err.message,
            exitCode: 1,
            durationMs: Date.now() - startTime,
            timedOut: false,
            internalError: `Docker execution unavailable: ${err.message}`,
          });
        });

        child.on('close', (code) => {
          if (timer) clearTimeout(timer);
          const durationMs = Date.now() - startTime;

          resolve({
            stdout: stdoutData,
            stderr: stderrData,
            exitCode: timedOut ? 124 : (code ?? 0),
            durationMs,
            timedOut,
          });
        });
      });
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`Failed to setup Docker sandbox: ${error.message}`);
      return {
        stdout: '',
        stderr: error.message,
        exitCode: 1,
        durationMs: Date.now() - startTime,
        timedOut: false,
        internalError: error.message,
      };
    } finally {
      // Guaranteed Cleanup (Milestone D12)
      try {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  evaluateVerdict(
    result: ExecutionResult,
    expectedOutput?: string,
  ): {
    verdict: Verdict;
    actualOutput?: string;
    error?: string;
    runtimeMs: number;
  } {
    if (result.internalError) {
      return {
        verdict: Verdict.INTERNAL_ERROR,
        error: result.internalError,
        runtimeMs: result.durationMs,
      };
    }

    if (result.compileError) {
      return {
        verdict: Verdict.COMPILE_ERROR,
        error: result.compileError,
        runtimeMs: result.durationMs,
      };
    }

    if (result.timedOut) {
      return {
        verdict: Verdict.TIME_LIMIT_EXCEEDED,
        error: 'Time limit exceeded',
        runtimeMs: result.durationMs,
      };
    }

    if (result.exitCode !== 0) {
      return {
        verdict: Verdict.RUNTIME_ERROR,
        error: result.stderr.trim() || `Process exited with code ${result.exitCode}`,
        runtimeMs: result.durationMs,
      };
    }

    const actualOutput = result.stdout.trim();
    if (expectedOutput !== undefined) {
      const normalizedExpected = expectedOutput.trim();
      if (actualOutput === normalizedExpected) {
        return {
          verdict: Verdict.ACCEPTED,
          actualOutput,
          runtimeMs: result.durationMs,
        };
      } else {
        return {
          verdict: Verdict.WRONG_ANSWER,
          actualOutput,
          runtimeMs: result.durationMs,
        };
      }
    }

    return {
      verdict: Verdict.ACCEPTED,
      actualOutput,
      runtimeMs: result.durationMs,
    };
  }

  private getFilenameForLanguage(lang: string): string {
    switch (lang) {
      case 'JAVASCRIPT':
        return 'solution.js';
      case 'PYTHON':
        return 'solution.py';
      case 'CPP':
        return 'solution.cpp';
      default:
        return 'solution.txt';
    }
  }

  private getDockerImageForLanguage(lang: string): string {
    switch (lang) {
      case 'JAVASCRIPT':
        return 'codearena-js-runner';
      case 'PYTHON':
        return 'python:3.11-alpine';
      case 'CPP':
        return 'gcc:13';
      default:
        return 'node:20-alpine';
    }
  }
}
