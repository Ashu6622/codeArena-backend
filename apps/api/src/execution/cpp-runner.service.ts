import { Injectable } from '@nestjs/common';
import { Verdict } from '@prisma/client';
import { spawn, execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type CppRunnerInput = {
  code: string;
  functionName: string;
  signature?: string;
  args: unknown[];
  timeoutMs: number;
  memoryLimitMb: number;
  maxOutputBytes: number;
};

export type CppRunnerResult = {
  verdict: Verdict;
  actualOutput?: string;
  error?: string;
  runtimeMs: number;
};

type ChildMessage =
  | { ok: true; actualOutput: string; runtimeMs: number }
  | { ok: false; verdict: Verdict; error: string; runtimeMs: number };

const HARNESS_HEADER = `
#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <unordered_map>
#include <map>
#include <set>
#include <unordered_set>
#include <algorithm>
#include <cmath>
#include <cctype>
#include <stdexcept>
#include <chrono>

using namespace std;

struct JsonValue {
    enum Type { NULL_VAL, BOOL, NUMBER, STRING, ARRAY, OBJECT } type = NULL_VAL;
    bool bool_val = false;
    double num_val = 0.0;
    string str_val;
    vector<JsonValue> arr_val;
    vector<pair<string, JsonValue>> obj_val;

    static void skip_ws(const string& s, size_t& idx) {
        while (idx < s.size() && (s[idx] == ' ' || s[idx] == '\\t' || s[idx] == '\\n' || s[idx] == '\\r')) idx++;
    }

    static JsonValue parse_val(const string& s, size_t& idx) {
        skip_ws(s, idx);
        if (idx >= s.size()) throw runtime_error("Unexpected EOF");
        char c = s[idx];
        if (c == 'n') { idx += 4; return JsonValue{}; }
        if (c == 't') { idx += 4; JsonValue v; v.type = BOOL; v.bool_val = true; return v; }
        if (c == 'f') { idx += 5; JsonValue v; v.type = BOOL; v.bool_val = false; return v; }
        if (c == '"') {
            idx++;
            string str;
            while (idx < s.size() && s[idx] != '"') {
                if (s[idx] == '\\\\' && idx + 1 < s.size()) idx++;
                str += s[idx++];
            }
            if (idx < s.size()) idx++;
            JsonValue v; v.type = STRING; v.str_val = str; return v;
        }
        if (c == '[') {
            idx++;
            JsonValue v; v.type = ARRAY;
            skip_ws(s, idx);
            if (idx < s.size() && s[idx] == ']') { idx++; return v; }
            while (idx < s.size()) {
                v.arr_val.push_back(parse_val(s, idx));
                skip_ws(s, idx);
                if (idx < s.size() && s[idx] == ']') { idx++; break; }
                if (idx < s.size() && s[idx] == ',') idx++;
            }
            return v;
        }
        if (c == '{') {
            idx++;
            JsonValue v; v.type = OBJECT;
            skip_ws(s, idx);
            if (idx < s.size() && s[idx] == '}') { idx++; return v; }
            while (idx < s.size()) {
                JsonValue key = parse_val(s, idx);
                skip_ws(s, idx);
                if (idx < s.size() && s[idx] == ':') idx++;
                JsonValue val = parse_val(s, idx);
                v.obj_val.push_back({key.str_val, val});
                skip_ws(s, idx);
                if (idx < s.size() && s[idx] == '}') { idx++; break; }
                if (idx < s.size() && s[idx] == ',') idx++;
            }
            return v;
        }
        size_t start = idx;
        if (s[idx] == '-') idx++;
        while (idx < s.size() && (isdigit(s[idx]) || s[idx] == '.' || s[idx] == 'e' || s[idx] == 'E' || s[idx] == '+' || s[idx] == '-')) idx++;
        JsonValue v; v.type = NUMBER; v.num_val = stod(s.substr(start, idx - start));
        return v;
    }

    static JsonValue parse(const string& s) {
        size_t idx = 0;
        return parse_val(s, idx);
    }

    const JsonValue& get(const string& key) const {
        for (const auto& kv : obj_val) {
            if (kv.first == key) return kv.second;
        }
        throw runtime_error("Key not found in JSON object: " + key);
    }

    int to_int() const { return static_cast<int>(num_val); }
    double to_double() const { return num_val; }
    string to_string() const { return str_val; }
    bool to_bool() const { return bool_val; }
};

template<typename T> T from_json(const JsonValue& v);
template<> int from_json<int>(const JsonValue& v) { return v.to_int(); }
template<> double from_json<double>(const JsonValue& v) { return v.to_double(); }
template<> bool from_json<bool>(const JsonValue& v) { return v.to_bool(); }
template<> string from_json<string>(const JsonValue& v) { return v.to_string(); }

template<typename T>
vector<T> from_json_vec(const JsonValue& v) {
    vector<T> res;
    for (const auto& item : v.arr_val) {
        res.push_back(from_json<T>(item));
    }
    return res;
}

template<> vector<int> from_json<vector<int>>(const JsonValue& v) { return from_json_vec<int>(v); }
template<> vector<string> from_json<vector<string>>(const JsonValue& v) { return from_json_vec<string>(v); }
template<> vector<double> from_json<vector<double>>(const JsonValue& v) { return from_json_vec<double>(v); }

string to_json(int v) { return to_string(v); }
string to_json(long long v) { return to_string(v); }
string to_json(double v) { return to_string(v); }
string to_json(bool v) { return v ? "true" : "false"; }
string to_json(const string& v) { return "\\"" + v + "\\""; }

template<typename T>
string to_json(const vector<T>& vec) {
    string s = "[";
    for (size_t i = 0; i < vec.size(); ++i) {
        if (i > 0) s += ",";
        s += to_json(vec[i]);
    }
    s += "]";
    return s;
}
`;

@Injectable()
export class CppRunnerService {
  private cppCompiler: string = 'g++';

  async run(input: CppRunnerInput): Promise<CppRunnerResult> {
    const started = process.hrtime.bigint();
    const tempDir = await fs.mkdtemp(join(tmpdir(), 'codearena-cpp-'));
    const sourcePath = join(tempDir, 'main.cpp');
    const binaryPath = join(tempDir, 'runner');

    try {
      const fullSource = this.generateSource(input);
      await fs.writeFile(sourcePath, fullSource, 'utf8');

      // Compile C++ source code
      try {
        await execFileAsync(this.cppCompiler, ['-O2', '-std=c++17', sourcePath, '-o', binaryPath]);
      } catch (compileError) {
        const errObj = compileError as { stderr?: Buffer | string; stdout?: Buffer | string };
        const errorMsg =
          errObj.stderr?.toString() || errObj.stdout?.toString() || 'Compilation error';
        return {
          verdict: Verdict.COMPILE_ERROR,
          error: this.cleanCompilerOutput(errorMsg),
          runtimeMs: Number((process.hrtime.bigint() - started) / 1000000n),
        };
      }

      // Execute binary
      return await this.executeBinary(binaryPath, input, started);
    } finally {
      // Clean up temporary directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private generateSource(input: CppRunnerInput): string {
    const codeHasSolutionClass = input.code.includes('class Solution');
    const argTypes = this.parseArgTypes(input.signature, input.args);

    let argVarsDecl = '';
    const argVarNames: string[] = [];
    for (let i = 0; i < argTypes.length; i++) {
      const varName = `arg${i}_val`;
      argVarNames.push(varName);
      argVarsDecl += `        auto ${varName} = from_json<${argTypes[i]}>(args_arr.arr_val[${i}]);\n`;
    }

    const callArgs = argVarNames.join(', ');

    let invocationSnippet = '';
    if (codeHasSolutionClass) {
      invocationSnippet = `
${argVarsDecl}        Solution solver;
        auto res = solver.${input.functionName}(${callArgs});
`;
    } else {
      invocationSnippet = `
${argVarsDecl}        auto res = ${input.functionName}(${callArgs});
`;
    }

    return `
${HARNESS_HEADER}

// User Code
${input.code}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    string payload;
    string line;
    while (getline(cin, line)) {
        payload += line;
    }

    auto start_time = chrono::high_resolution_clock::now();

    try {
        JsonValue data = JsonValue::parse(payload);
        size_t max_output_bytes = static_cast<size_t>(data.get("maxOutputBytes").to_int());
        JsonValue args_arr = data.get("args");

        ${invocationSnippet}

        auto end_time = chrono::high_resolution_clock::now();
        int runtime_ms = chrono::duration_cast<chrono::milliseconds>(end_time - start_time).count();

        string output = to_json(res);
        if (output.size() > max_output_bytes) {
            cout << "{\\"ok\\":false,\\"verdict\\":\\"RUNTIME_ERROR\\",\\"error\\":\\"Output limit exceeded\\",\\"runtimeMs\\":" << runtime_ms << "}";
        } else {
            cout << "{\\"ok\\":true,\\"actualOutput\\":" << to_json(output) << ",\\"runtimeMs\\":" << runtime_ms << "}";
        }
    } catch (const exception& e) {
        auto end_time = chrono::high_resolution_clock::now();
        int runtime_ms = chrono::duration_cast<chrono::milliseconds>(end_time - start_time).count();
        string err_msg = e.what();
        cout << "{\\"ok\\":false,\\"verdict\\":\\"RUNTIME_ERROR\\",\\"error\\":" << to_json(err_msg) << ",\\"runtimeMs\\":" << runtime_ms << "}";
    } catch (...) {
        auto end_time = chrono::high_resolution_clock::now();
        int runtime_ms = chrono::duration_cast<chrono::milliseconds>(end_time - start_time).count();
        cout << "{\\"ok\\":false,\\"verdict\\":\\"RUNTIME_ERROR\\",\\"error\\":\\"Unknown execution error\\",\\"runtimeMs\\":" << runtime_ms << "}";
    }

    return 0;
}
`;
  }

  private parseArgTypes(signature: string | undefined, args: unknown[]): string[] {
    if (!signature) {
      return args.map((arg) => this.deduceTypeFromVal(arg));
    }

    const match = signature.match(/\(([^)]*)\)/);
    if (!match || !match[1].trim()) {
      return args.map((arg) => this.deduceTypeFromVal(arg));
    }

    const params = match[1].split(',').map((p) => p.trim());
    return params.map((param, i) => {
      // e.g. "nums: number[]" or "vector<int>& nums" or "int target"
      const lower = param.toLowerCase();
      if (lower.includes('vector<int>') || lower.includes('number[]') || lower.includes('int[]'))
        return 'vector<int>';
      if (
        lower.includes('vector<string>') ||
        lower.includes('string[]') ||
        lower.includes('vector<std::string>')
      )
        return 'vector<string>';
      if (
        lower.includes('vector<double>') ||
        lower.includes('double[]') ||
        lower.includes('float[]')
      )
        return 'vector<double>';
      if (lower.includes('string') || lower.includes('std::string')) return 'string';
      if (lower.includes('bool') || lower.includes('boolean')) return 'bool';
      if (
        lower.includes('int') ||
        lower.includes('number') ||
        lower.includes('long') ||
        lower.includes('size_t')
      )
        return 'int';
      return this.deduceTypeFromVal(args[i]);
    });
  }

  private deduceTypeFromVal(val: unknown): string {
    if (typeof val === 'number') return 'int';
    if (typeof val === 'boolean') return 'bool';
    if (typeof val === 'string') return 'string';
    if (Array.isArray(val)) {
      if (val.length > 0 && typeof val[0] === 'string') return 'vector<string>';
      return 'vector<int>';
    }
    return 'int';
  }

  private executeBinary(
    binaryPath: string,
    input: CppRunnerInput,
    started: bigint,
  ): Promise<CppRunnerResult> {
    const stdoutLimitBytes = input.maxOutputBytes + 4096;
    const stderrLimitBytes = 4096;

    return new Promise((resolve) => {
      let settled = false;
      let stdout = '';
      let stderr = '';

      const child = spawn(binaryPath, [], {
        cwd: tmpdir(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const finish = (result: CppRunnerResult) => {
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
          error: error instanceof Error ? error.message : 'C++ runner failed',
          runtimeMs: Number((process.hrtime.bigint() - started) / 1000000n),
        });
      });

      child.once('close', (code, signal) => {
        if (settled) return;

        if (code !== 0 || signal) {
          finish({
            verdict: Verdict.RUNTIME_ERROR,
            error: stderr.trim() || 'C++ runner exited unexpectedly',
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
            error: 'Invalid C++ runner response',
            runtimeMs: Number((process.hrtime.bigint() - started) / 1000000n),
          });
        }
      });

      child.stdin.end(
        JSON.stringify({
          code: input.code,
          functionName: input.functionName,
          args: input.args,
          maxOutputBytes: input.maxOutputBytes,
        }),
      );
    });
  }

  private cleanCompilerOutput(output: string): string {
    return output
      .replace(/\/tmp\/codearena-cpp-[^/]+\//g, '')
      .replace(/\/private\/tmp\/codearena-cpp-[^/]+\//g, '')
      .trim();
  }
}
