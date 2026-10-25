import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
/** One OCCT process owns a project's feature state. Requests are ordered; callers
 * persist the returned operation log in their existing project document. */
export function createOcctSession({ binary, timeoutMs = 30000 } = {}) {
  if (!binary || !path.isAbsolute(binary)) throw new Error('occt_absolute_binary_required');
  const child = spawn(binary, ['--serve'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const lines = createInterface({ input: child.stdout });
  let sequence = 0, pending = null, closed = false, queue = Promise.resolve();
  const fail = error => { closed = true; if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; } };
  child.on('error', fail);child.on('exit', () => fail(new Error('occt_session_closed')));
  // Drain stderr without retaining potentially unbounded native diagnostics.
  child.stderr.resume();
  lines.on('line', line => {
    if (!line.startsWith('AGENTSAM_RESULT=') || !pending) return;
    let receipt;
    try { receipt = JSON.parse(line.slice(16)); } catch { fail(new Error('occt_receipt_invalid'));child.kill();return; }
    const { resolve, reject, timer, requestId } = pending;pending = null;clearTimeout(timer);
    if (receipt.ok !== true) reject(new Error(receipt.error || 'occt_request_failed'));
    else if (receipt.engine !== 'occt' || receipt.requestId !== requestId) { fail(new Error('occt_receipt_unverified'));child.kill();reject(new Error('occt_receipt_unverified')); }
    else resolve(receipt);
  });
  function request(input) {
    const invoke = () => new Promise((resolve, reject) => {
      if (closed) return reject(new Error('occt_session_closed'));
      const requestId = ++sequence;
      const timer = setTimeout(() => { fail(new Error('occt_request_timeout'));child.kill(); }, timeoutMs);
      pending = { resolve, reject, timer, requestId };
      child.stdin.write(JSON.stringify({ ...input, requestId }) + '\n', error => { if (error) { fail(error);child.kill(); } });
    });
    const result = queue.then(invoke);queue = result.catch(() => {});return result;
  }
  return { request, close() { fail(new Error('occt_session_closed'));lines.close();child.stdin.end();child.kill(); } };
}
