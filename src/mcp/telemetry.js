import fs from 'node:fs';
import path from 'node:path';
import { homeDirectory } from './authority.js';

export function getTelemetrySessionPath(options = {}) {
  const home = homeDirectory(options);
  return path.join(home, '.agentsam', 'telemetry', 'session-receipts.json');
}

export function recordToolReceipt(receipt = {}, options = {}) {
  const filePath = getTelemetrySessionPath(options);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  let existing = [];
  try {
    if (fs.existsSync(filePath)) {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(existing)) existing = [];
    }
  } catch {
    existing = [];
  }

  const normalized = {
    id: receipt.id || `tcl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agent_run_id: receipt.agent_run_id || null,
    conversation_id: receipt.conversation_id || null,
    tool_key: String(receipt.tool_key || receipt.tool || receipt.name || 'unknown'),
    source_client: receipt.source_client || 'agentsam',
    status: receipt.status || (receipt.error ? 'failure' : 'success'),
    duration_ms: Number(receipt.duration_ms ?? receipt.latency_ms ?? 0),
    error_code: receipt.error_code || (receipt.error ? 'EXECUTION_ERROR' : null),
    failure_origin: receipt.failure_origin || null,
    created_at: receipt.created_at || new Date().toISOString(),
  };

  existing.push(normalized);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf8');
  return normalized;
}

export function getSessionToolReceipts(options = {}) {
  const filePath = getTelemetrySessionPath(options);
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function clearSessionToolReceipts(options = {}) {
  const filePath = getTelemetrySessionPath(options);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function summarizeToolReceipts(receipts = []) {
  let toolCallCount = 0;
  let mcpCallCount = 0;
  let terminalCallCount = 0;
  let githubCallCount = 0;
  let d1CallCount = 0;
  let failureCount = 0;

  for (const r of receipts) {
    toolCallCount += 1;
    const key = (r.tool_key || '').toLowerCase();
    if (key.startsWith('mcp:') || key.includes('mcp') || r.source_client === 'cursor_mcp') {
      mcpCallCount += 1;
    }
    if (key.includes('terminal') || key.includes('bash') || key.includes('shell')) {
      terminalCallCount += 1;
    }
    if (key.includes('github') || key.includes('gh_') || key.includes('git')) {
      githubCallCount += 1;
    }
    if (key.includes('d1') || key.includes('sqlite') || key.includes('database')) {
      d1CallCount += 1;
    }
    if (r.status === 'failure' || r.error_code) {
      failureCount += 1;
    }
  }

  return {
    tool_call_count: toolCallCount,
    mcp_call_count: mcpCallCount,
    terminal_call_count: terminalCallCount,
    github_call_count: githubCallCount,
    d1_call_count: d1CallCount,
    failure_count: failureCount,
    success_count: toolCallCount - failureCount,
  };
}
