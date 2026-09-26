import { Injectable } from '@nestjs/common';
import { Verdict } from '@prisma/client';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

export type PythonRunnerInput = {
  code: string;
  functionName: string;
  args: unknown[];
  timeoutMs: number;
  memoryLimitMb: number;
  maxOutputBytes: number;
};

export type PythonRunnerResult = {
  verdict: Verdict;
  actualOutput?: string;
  error?: string;
  runtimeMs: number;
};

type ChildMessage =
  | { ok: true; actualOutput: string; runtimeMs: number }
  | { ok: false; verdict: Verdict; error: string; runtimeMs: number };

const PYTHON_RUNNER_SOURCE = `
import sys
import json
import time

def send(message):
    sys.stdout.write(json.dumps(message))
    sys.stdout.flush()

payload = sys.stdin.read()
start_time = time.perf_counter()

try:
    data = json.loads(payload)
    code = str(data['code'])
    func_name = str(data['functionName'])
    args = data['args']
    max_output_bytes = int(data['maxOutputBytes'])

    scope = {}
    exec(code, scope)

    if func_name not in scope or not callable(scope[func_name]):
        raise Exception(f"Expected function '{func_name}' to be defined")

    func = scope[func_name]
    res = func(*args)
    end_time = time.perf_counter()
    runtime_ms = int((end_time - start_time) * 1000)

    output = json.dumps(res, separators=(',', ':'))
    if len(output.encode('utf-8')) > max_output_bytes:
        send({'ok': False, 'verdict': 'RUNTIME_ERROR', 'error': 'Output limit exceeded', 'runtimeMs': runtime_ms})
    else:
        send({'ok': True, 'actualOutput': output, 'runtimeMs': runtime_ms})

except SyntaxError as e:
    runtime_ms = int((time.perf_counter() - start_time) * 1000)
    send({'ok': False, 'verdict': 'COMPILE_ERROR', 'error': f"SyntaxError: {e.msg} (line {e.lineno})", 'runtimeMs': runtime_ms})
except Exception as e:
    runtime_ms = int((time.perf_counter() - start_time) * 1000)
    err_msg = str(e) if str(e) else type(e).__name__
    send({'ok': False, 'verdict': 'RUNTIME_ERROR', 'error': err_msg, 'runtimeMs': runtime_ms})
`;

@Injectable()
export class PythonRunnerService {
  private pythonBinary: string | null = null;

  private getPythonBinary(): string {
    if (this.pythonBinary) return this.pythonBinary;
    // Default to python3 on macOS/Linux
    return 'python3';
  }

  run(input: PythonRunnerInput): Promise<PythonRunnerResult> {
    const started = process.hrtime.bigint();
    const stdoutLimitBytes = input.maxOutputBytes + 4096;
    const stderrLimitBytes = 4096;

    return new Promise((resolve) => {
      let settled = false;
      let stdout = '';
      let stderr = '';

      const child = spawn(this.getPythonBinary(), ['-c', PYTHON_RUNNER_SOURCE], {
        cwd: tmpdir(),
        env: { PYTHONUNBUFFERED: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const finish = (result: PythonRunnerResult) => {
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
          error: error instanceof Error ? error.message : 'Python runner failed',
          runtimeMs: Number((process.hrtime.bigint() - started) / 1000000n),
        });
      });

      child.once('close', (code, signal) => {
        if (settled) return;

        if (code !== 0 || signal) {
          finish({
            verdict: Verdict.RUNTIME_ERROR,
            error: stderr.trim() || 'Python runner exited unexpectedly',
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
            error: 'Invalid Python runner response',
            runtimeMs: Number((process.hrtime.bigint() - started) / 1000000n),
          });
        }
      });

      child.stdin.end(JSON.stringify(input));
    });
  }
}
