import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createEvidenceOperations } from '../sam/packs/evidence/index.js';
import { createLocalEvidenceHost } from '../sam/packs/evidence/host-local.js';
import { auditNames } from '../sam/packs/evidence/normalize.js';

const SUBS = ['begin', 'capture', 'seal', 'deliver', 'compare', 'ingest'];
const HELP = [
  'agentsam sam evidence doctor                      what is wired in this project (adapters, store, project)',
  'agentsam sam evidence <begin|capture|seal|deliver|compare|ingest> --input <file|-> [--allow <dir>]',
  'agentsam sam evidence audit <dir> [--allow <dir>] classify names against the canonical layout',
  '',
  'Input is JSON. Output is JSON. The store is <project>/.agentsam/evidence (git-ignored).',
  'Running this command is the approval: nothing here is reachable from the read-only stdio bridge.',
  '',
].join('\n');

async function readStdin(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function listNames(directory) {
  const found = [];
  const walk = async (dir, rel) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), child);
      else if (entry.isFile() && found.length < 5000) found.push(child);
    }
  };
  await walk(directory, '');
  return found;
}

export async function runSamEvidence(argv = [], { root = process.cwd(), write = (s) => process.stdout.write(s), stdin = process.stdin } = {}) {
  const args = argv.filter((a) => a !== '--json');
  const sub = args[0] ?? 'help';
  const out = (value) => write(`${JSON.stringify(value, null, 2)}\n`);
  if (sub === 'help' || sub === '--help' || sub === '-h') { write(HELP); return { ok: true, help: HELP }; }

  const allow = [];
  for (let i = 0; i < args.length; i += 1) if (args[i] === '--allow' && args[i + 1]) allow.push(path.resolve(args[i + 1]));
  const host = await createLocalEvidenceHost({ root: path.resolve(root), readableRoots: allow });

  if (sub === 'doctor') { const result = { ok: true, ...host.report }; out(result); return result; }

  if (sub === 'audit') {
    const target = args[1] && !args[1].startsWith('--') ? path.resolve(args[1]) : null;
    if (!target) { const result = { ok: false, error: 'directory_required' }; out(result); return result; }
    const real = await realpath(target).catch(() => null);
    const roots = await Promise.all(host.report.readableRoots.map((r) => realpath(r).catch(() => r)));
    if (!real || !roots.some((r) => real === r || real.startsWith(r + path.sep))) {
      const result = { ok: false, error: 'directory_outside_readable_roots', guidance: 'Pass --allow <dir> to permit reading it.' };
      out(result);
      return result;
    }
    const { canonical, legacy } = auditNames(await listNames(real));
    const result = { ok: legacy.length === 0, canonical: canonical.length, legacy, guidance: legacy.length ? 'Run: sam evidence ingest (dry run by default) to map these onto the canonical layout.' : null };
    out(result);
    return result;
  }

  if (!SUBS.includes(sub)) { const result = { ok: false, error: 'unknown_sam_evidence_command' }; out(result); return result; }
  const at = args.indexOf('--input');
  const source = at >= 0 ? args[at + 1] : null;
  if (!source) { const result = { ok: false, error: 'input_required', guidance: 'Pass --input <file|-> with a JSON object.' }; out(result); return result; }
  let input;
  try { input = JSON.parse(source === '-' ? await readStdin(stdin) : await readFile(path.resolve(root, source), 'utf8')); } catch { const result = { ok: false, error: 'invalid_json_input' }; out(result); return result; }

  const ops = createEvidenceOperations(host.options);
  try {
    const result = await ops.find((o) => o.id === `sam.evidence.${sub}`).handler(input, {});
    out(result);
    if (sub === 'deliver' && result.ok) {
      write(`Serving until ${result.expiresAt}. Press Ctrl-C to stop.\n`);
      await new Promise((resolve) => { const timer = setTimeout(resolve, result.ttlSeconds * 1000); process.once('SIGINT', () => { clearTimeout(timer); resolve(); }); });
    }
    return result;
  } catch (error) {
    const result = { ok: false, error: error?.code ?? 'evidence_failed', ...(error?.detail !== undefined ? { detail: error.detail } : {}) };
    out(result);
    return result;
  } finally { await ops.shutdown(); }
}
