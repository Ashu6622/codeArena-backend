import { Injectable } from '@nestjs/common';
import { Verdict } from '@prisma/client';
import { Worker } from 'node:worker_threads';

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

type WorkerMessage =
  | { ok: true; actualOutput: string; runtimeMs: number }
  | { ok: false; verdict: Verdict; error: string; runtimeMs: number };

const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');

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

try {
  const started = process.hrtime.bigint();
  const context = vm.createContext({
    __args: workerData.args,
    __result: undefined,
    console: { log() {}, error() {}, warn() {} },
  });
  const source = String(workerData.code) + '\\n' +
    'if (typeof ' + workerData.functionName + ' !== "function") { throw new Error("Expected function ' + workerData.functionName + ' to be defined"); }\\n' +
    '__result = ' + workerData.functionName + '(...__args);';
  const script = new vm.Script(source);
  script.runInContext(context, { timeout: workerData.timeoutMs });
  const actualOutput = serializeOutput(context.__result, workerData.maxOutputBytes);
  const runtimeMs = Number((process.hrtime.bigint() - started) / 1000000n);
  parentPort.postMessage({ ok: true, actualOutput, runtimeMs });
} catch (error) {
  const message = error && typeof error.message === 'string' ? error.message : 'JavaScript execution failed';
  const verdict = error instanceof SyntaxError
    ? 'COMPILE_ERROR'
    : message.includes('Script execution timed out')
      ? 'TIME_LIMIT_EXCEEDED'
      : 'RUNTIME_ERROR';
  parentPort.postMessage({ ok: false, verdict, error: message, runtimeMs: 0 });
}
`;

@Injectable()
export class JavaScriptRunnerService {
  run(input: JavaScriptRunnerInput): Promise<JavaScriptRunnerResult> {
    const started = process.hrtime.bigint();

    return new Promise((resolve) => {
      let settled = false;
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: input,
        resourceLimits: {
          maxOldGenerationSizeMb: input.memoryLimitMb,
        },
      });

      const timer = setTimeout(() => {
        finish({
          verdict: Verdict.TIME_LIMIT_EXCEEDED,
          error: 'Time limit exceeded',
          runtimeMs: input.timeoutMs,
        });
      }, input.timeoutMs + 25);

      const finish = (result: JavaScriptRunnerResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        resolve(result);
      };

      worker.once('message', (message: WorkerMessage) => {
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
      });

      worker.once('error', (error) => {
        finish({
          verdict: Verdict.RUNTIME_ERROR,
          error: error instanceof Error ? error.message : 'JavaScript worker failed',
          runtimeMs: Number((process.hrtime.bigint() - started) / 1000000n),
        });
      });

      worker.once('exit', (code) => {
        if (settled || code === 0) return;
        finish({
          verdict: Verdict.RUNTIME_ERROR,
          error: 'JavaScript worker exited unexpectedly',
          runtimeMs: Number((process.hrtime.bigint() - started) / 1000000n),
        });
      });
    });
  }
}
