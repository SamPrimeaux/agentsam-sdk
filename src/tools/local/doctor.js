import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createTrace, errorResult, okResult } from '../../core/ToolResult.js';
import pkg from '../../../package.json' with { type: 'json' };

function exists(filePath) {
  return fs.existsSync(filePath);
}

function commandVersion(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  return {
    available: result.status === 0,
    output: String(result.stdout || result.stderr || '').trim(),
    error: result.error?.message || null,
  };
}

function check(name, ok, detail = '', meta = {}) {
  return {
    name,
    ok: Boolean(ok),
    detail,
    ...meta,
  };
}

async function checkPtyHealth(url = 'http://127.0.0.1:3099/health') {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 750);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data?.ok === true, detail: res.ok ? 'local PTY responded' : `HTTP ${res.status}`, data };
  } catch (error) {
    return { ok: false, detail: error?.name === 'AbortError' ? 'local PTY health check timed out' : 'local PTY not running' };
  }
}

export async function runDoctor(input = {}, context = {}) {
  const trace = createTrace({ runtime: context.runtime || 'local' });
  const cwd = path.resolve(input.cwd || process.cwd());
  const configPath = path.join(cwd, '.agentsam', 'config.json');
  const packagePath = path.join(cwd, 'package.json');
  const gitPath = path.join(cwd, '.git');
  const wrangler = commandVersion('wrangler');
  const git = commandVersion('git');
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  const pty = await checkPtyHealth(input.ptyHealthUrl);

  let config = null;
  if (exists(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      config = { parse_error: error?.message || String(error) };
    }
  }

  const checks = [
    check('node', nodeMajor >= 20, `Node ${process.versions.node}`, { required: '>=20' }),
    check('sdk', true, `${pkg.name}@${pkg.version}`),
    check('project_root', exists(packagePath) || exists(configPath), cwd),
    check('agentsam_config', exists(configPath), exists(configPath) ? '.agentsam/config.json found' : 'missing .agentsam/config.json'),
    check('package_json', exists(packagePath), exists(packagePath) ? 'package.json found' : 'missing package.json'),
    check('git_repo', exists(gitPath), exists(gitPath) ? '.git found' : 'not a git repo at cwd'),
    check('git_cli', git.available, git.output || git.error || 'git not available'),
    check('wrangler_cli', wrangler.available, wrangler.output || wrangler.error || 'wrangler not available'),
    check('cloudflare_token', Boolean(process.env.CLOUDFLARE_API_TOKEN), process.env.CLOUDFLARE_API_TOKEN ? 'CLOUDFLARE_API_TOKEN set' : 'CLOUDFLARE_API_TOKEN missing'),
    check('cloudflare_account', Boolean(process.env.CLOUDFLARE_ACCOUNT_ID), process.env.CLOUDFLARE_ACCOUNT_ID ? 'CLOUDFLARE_ACCOUNT_ID set' : 'CLOUDFLARE_ACCOUNT_ID missing'),
    check('local_pty', pty.ok, pty.detail),
  ];

  const blocking = checks.filter((row) => ['node'].includes(row.name) && !row.ok);
  const warnings = checks.filter((row) => !row.ok && !['node'].includes(row.name));

  if (blocking.length > 0) {
    return errorResult('local.doctor', 'doctor_blocked', 'Required local checks failed', { cwd, checks, config, blocking, warnings }, trace);
  }

  return okResult('local.doctor', {
    cwd,
    config,
    checks,
    warnings,
    summary: {
      ok: blocking.length === 0,
      warningCount: warnings.length,
    },
  }, trace);
}
