import { Injectable } from '@nestjs/common';
import { Verdict } from '@prisma/client';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

export type JavaScriptRunnerInput = {
  code: string;
  functionName: string;
  args: unknown[];
  timeoutMs: number;
  memoryLimitMb: number;
  maxOutputBytes: number;
};

export type JavaScriptRunnerResult = {
  verdict: Verdict;
  actualOutput?: string;
  error?: string;
  runtimeMs: number;
};

type ChildMessage =
  | { ok: true; actualOutput: string; runtimeMs: number }
  | { ok: false; verdict: Verdict; error: string; runtimeMs: number };

const CHILD_RUNNER_SOURCE = String.raw`
const vm = require('node:vm');

function send(message) {
  process.stdout.write(JSON.stringify(message));
}

function serializeOutput(value, maxOutputBytes) {
  if (value && typeof value.then === 'function') {
    const error = new Error('Async solutions are not supported yet');
    error.code = 'ASYNC_UNSUPPORTED';
    throw error;
  }
  const output = value === undefined ? 'undefined' : JSON.stringify(value);
  const normalized = output === undefined ? String(value) : output;
  if (Buffer.byteLength(normalized, 'utf8') > maxOutputBytes) {
    const error = new Error('Output limit exceeded');
    error.code = 'OUTPUT_LIMIT';
    throw error;
  }
  return normalized;
}

function verdictFor(error) {
  const message = error && typeof error.message === 'string'
    ? error.message
    : 'JavaScript execution failed';
  if (error instanceof SyntaxError) return 'COMPILE_ERROR';
  if (message.includes('Script execution timed out')) return 'TIME_LIMIT_EXCEEDED';
  return 'RUNTIME_ERROR';
}

let payload = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  payload += chunk;
});
process.stdin.on('end', () => {
  const started = process.hrtime.bigint();
  try {
    const input = JSON.parse(payload);
    const functionName = String(input.functionName);
    if (!/^[A-Za-z_$][\w$]*$/.test(functionName)) {
      throw new Error('Invalid function name');
    }

    const context = vm.createContext({
      __args: input.args,
      __result: undefined,
      console: { log() {}, error() {}, warn() {} },
    });
    const source = String(input.code) + '\n' +
      'if (typeof ' + functionName + ' !== "function") { throw new Error("Expected function ' + functionName + ' to be defined"); }\n' +
      '__result = ' + functionName + '(...__args);';

    const script = new vm.Script(source);
    script.runInContext(context, { timeout: input.timeoutMs });
    const actualOutput = serializeOutput(context.__result, input.maxOutputBytes);
    const runtimeMs = Number((process.hrtime.bigint() - started) / 1000000n);
    send({ ok: true, actualOutput, runtimeMs });
  } catch (error) {
    const message = error && typeof error.message === 'string'
      ? error.message
      : 'JavaScript execution failed';
    const runtimeMs = Number((process.hrtime.bigint() - started) / 1000000n);
    send({ ok: false, verdict: verdictFor(error), error: message, runtimeMs });
  }
});
`;

@Injectable()
export class JavaScriptRunnerService {
  run(input: JavaScriptRunnerInput): Promise<JavaScriptRunnerResult> {
    const started = process.hrtime.bigint();
    const memoryLimitMb = Math.max(16, Math.floor(input.memoryLimitMb));
    const stdoutLimitBytes = input.maxOutputBytes + 4096;
    const stderrLimitBytes = 4096;

    return new Promise((resolve) => {
      let settled = false;
      let stdout = '';
      let stderr = '';
      const child = spawn(
        process.execPath,
        [`--max-old-space-size=${memoryLimitMb}`, '-e', CHILD_RUNNER_SOURCE],
        {
          cwd: tmpdir(),
          env: { NODE_ENV: 'production' },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      const finish = (result: JavaScriptRunnerResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!child.killed) child.kill('SIGKILL');
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish({
          verdict: Verdict.TIME_LIMIT_EXCEEDED,
          error: 'Time limit exceeded',
          runtimeMs: input.timeoutMs,
        });
      }, input.timeoutMs + 50);

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        if (Buffer.byteLength(stdout, 'utf8') > stdoutLimitBytes) {
          finish({
            verdict: Verdict.RUNTIME_ERROR,
            error: 'Runner protocol output limit exceeded',
            runtimeMs: Number((process.hrtime.bigint() - started) / 1000000n),
          });
        }
      });

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
        if (Buffer.byteLength(stderr, 'utf8') > stderrLimitBytes) {
          stderr = stderr.slice(0, stderrLimitBytes);
        }
      });

      child.once('error', (error) => {
        finish({
          verdict: Verdict.RUNTIME_ERROR,
          error: error instanceof Error ? error.message : 'JavaScript runner failed',
          runtimeMs: Number((process.hrtime.bigint() - started) / 1000000n),
        });
      });

      child.once('close', (code, signal) => {
        if (settled) return;

        if (code !== 0 || signal) {
          finish({
            verdict: Verdict.RUNTIME_ERROR,
            error: stderr.trim() || 'JavaScript runner exited unexpectedly',
            runtimeMs: Number((process.hrtime.bigint() - started) / 1000000n),
          });
          return;
        }

        try {
          const message = JSON.parse(stdout) as ChildMessage;
          const elapsedMs = Number((process.hrtime.bigint() - started) / 1000000n);
          if (message.ok) {
            finish({
              verdict: Verdict.ACCEPTED,
              actualOutput: message.actualOutput,
              runtimeMs: Math.max(message.runtimeMs, elapsedMs),
            });
            return;
          }
          finish({
            verdict: message.verdict,
            error: message.error,
            runtimeMs: Math.max(message.runtimeMs, elapsedMs),
          });
        } catch {
          finish({
            verdict: Verdict.INTERNAL_ERROR,
            error: 'Invalid JavaScript runner response',
            runtimeMs: Number((process.hrtime.bigint() - started) / 1000000n),
          });
        }
      });

      child.stdin.end(JSON.stringify(input));
    });
  }
}
