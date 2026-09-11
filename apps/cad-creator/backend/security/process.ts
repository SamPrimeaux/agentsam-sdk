import { spawn, SpawnOptionsWithoutStdio } from 'child_process';

export interface ProcessExecutionOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
  maxBufferBytes?: number;
}

export interface ProcessExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Safe Process Runner
 *
 * Enforces security boundaries:
 * 1. ALWAYS uses argv arrays (never accepts a single unsanitized command string)
 * 2. shell: false ALWAYS to prevent command injection
 * 3. Enforces execution timeouts and memory limits
 */
export async function runSafeProcess(
  executable: string,
  args: string[],
  options: ProcessExecutionOptions = {}
): Promise<ProcessExecutionResult> {
  const timeoutMs = options.timeoutMs || 30000;
  const maxBuffer = options.maxBufferBytes || 10 * 1024 * 1024; // 10MB

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let timedOut = false;

    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      shell: false, // Critical security constraint
    };

    let child;
    try {
      child = spawn(executable, args, spawnOptions);
    } catch (err) {
      return reject(err);
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      if (stdoutBuffer.length < maxBuffer) {
        stdoutBuffer += data.toString();
      }
    });

    child.stderr.on('data', (data) => {
      if (stderrBuffer.length < maxBuffer) {
        stderrBuffer += data.toString();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        durationMs: Date.now() - startTime,
        timedOut,
      });
    });
  });
}
