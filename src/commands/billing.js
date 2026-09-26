/**
 * Billing relationships — not --billing-project (quota attribution).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function writeLine(write, value = '') {
  write(`${value}\n`);
}

async function runGcloud(args, env) {
  try {
    const { stdout, stderr } = await execFileAsync('gcloud', args, {
      timeout: 30000,
      env,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout || ''),
      stderr: String(error?.stderr || error?.message || ''),
    };
  }
}

function printHelp(write) {
  writeLine(write, '');
  writeLine(write, '  agentsam billing');
  writeLine(write, '  agentsam billing accounts');
  writeLine(write, '  agentsam billing project [PROJECT_ID]');
  writeLine(write, '  agentsam billing budgets --account XXXXXX-XXXXXX-XXXXXX');
  writeLine(write, '');
  writeLine(write, '  Note: gcloud --billing-project only attributes quota for one CLI call.');
  writeLine(write, '  It does not show historical spend. Use Cloud Billing reports / BigQuery export for costs.');
  writeLine(write, '  Future: agentsam costs gcp|cloudflare|models');
  writeLine(write, '');
}

export async function runBilling(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');

  if (!args.length || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp(write);
    if (!args.length) {
      // Default: accounts list
      args.push('accounts');
    } else {
      return 0;
    }
  }

  if (args[0] === 'accounts') {
    const result = await runGcloud(['billing', 'accounts', 'list', '--format=table(name,displayName,open)'], env);
    if (!result.ok) {
      write(result.stderr || result.stdout);
      return 1;
    }
    if (json) write(JSON.stringify({ ok: true, stdout: result.stdout }, null, 2) + '\n');
    else {
      writeLine(write, '');
      writeLine(write, '  Agent Sam · billing accounts');
      writeLine(write, '  (relationship inventory — not a spend dashboard)');
      writeLine(write, '');
      write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
    }
    return 0;
  }

  if (args[0] === 'project') {
    let project = args[1] || '';
    if (!project) {
      const cfg = await runGcloud(['config', 'get-value', 'project'], env);
      project = cfg.stdout.trim();
    }
    if (!project || project === '(unset)') {
      writeLine(write, '  ✕ Pass a project id or set gcloud config project.');
      return 1;
    }
    const result = await runGcloud(['billing', 'projects', 'describe', project, '--format=yaml(billingAccountName,billingEnabled,projectId)'], env);
    if (!result.ok) {
      write(result.stderr || result.stdout);
      return 1;
    }
    write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
    return 0;
  }

  if (args[0] === 'budgets') {
    let account = '';
    for (let i = 1; i < args.length; i += 1) {
      if (args[i] === '--account') account = args[++i] || '';
      else if (args[i].startsWith('--account=')) account = args[i].slice('--account='.length);
      else if (!args[i].startsWith('-') && !account) account = args[i];
    }
    if (!account || account.includes('XXXX')) {
      writeLine(write, '  ✕ Pass a real billing account id from: agentsam billing accounts');
      writeLine(write, '    Example: agentsam billing budgets --account 017E01-4426EF-21356F');
      return 1;
    }
    const name = account.startsWith('billingAccounts/') ? account : `billingAccounts/${account}`;
    const result = await runGcloud(['billing', 'budgets', 'list', '--billing-account', name.replace(/^billingAccounts\//, ''), '--format=table(displayName,amount,budgetFilter)'], env);
    // gcloud wants the id without prefix sometimes; try both on failure
    if (!result.ok) {
      const retry = await runGcloud(['billing', 'budgets', 'list', `--billing-account=${account.replace(/^billingAccounts\//, '')}`], env);
      if (!retry.ok) {
        write(retry.stderr || result.stderr || retry.stdout);
        writeLine(write, '');
        writeLine(write, '  Tip: copy ACCOUNT_ID from `agentsam billing accounts` — not the placeholder XXXXXX-XXXXXX-XXXXXX.');
        return 1;
      }
      write(retry.stdout.endsWith('\n') ? retry.stdout : `${retry.stdout}\n`);
      return 0;
    }
    write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
    return 0;
  }

  printHelp(write);
  return 1;
}
