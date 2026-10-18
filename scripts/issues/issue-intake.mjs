#!/usr/bin/env node
/**
 * Read-only GitHub issue-form intake for existing SAM planning/ACP workflows.
 * No GitHub API calls, execution, storage mutation or automatic approvals.
 * Output is an ephemeral handoff document, not a second task registry.
 */
import { readFileSync } from 'node:fs';

const SPECS = Object.freeze({
  task: Object.freeze({
    'outcome': 'User journey and desired outcome',
    'authority': 'Existing owner and reusable implementation',
    'boundaries': 'Scope and non-goals',
    'acceptance': 'Acceptance criteria and failure paths',
    'delivery': 'Delivery / installation / verification route',
  }),
  bug: Object.freeze({
    'surface': 'Affected application, interface, or operation',
    'steps': 'Steps to reproduce',
    'actual': 'Actual behavior',
    'expected': 'Expected behavior and user impact',
    'acceptance': 'Repair acceptance',
  }),
  product: Object.freeze({
    'persona': 'Who installs this and what do they expect?',
    'journey': 'End-to-end user journey',
    'lifecycle': 'Resource and action lifecycle',
    'ownership': 'Existing source of truth and reuse',
    'experience': 'User-visible interaction and states',
    'portability': 'Installation, host dependencies, and data control',
    'acceptance': 'Product readiness and evidence',
    'distribution': 'How users open it after delivery',
  }),
});

function sectionsFromIssue(body) {
  const sections = new Map();
  const heading = /^###\s+(.+?)\s*$/gm;
  const hits = [...body.matchAll(heading)];
  for (let i = 0; i < hits.length; i++) {
    const title = hits[i][1].trim();
    const start = hits[i].index + hits[i][0].length;
    const end = i + 1 < hits.length ? hits[i + 1].index : body.length;
    const raw = body.slice(start, end).trim();
    // GitHub outputs this literal marker for unanswered optional issue-form inputs.
    const value = raw === '_No response_' ? '' : raw;
    if (sections.has(title)) throw new Error('duplicate_form_section:' + title);
    sections.set(title, value);
  }
  return sections;
}

export function parseIssueIntake(body, kind) {
  if (typeof body !== 'string') throw new TypeError('issue body must be a string');
  if (!Object.hasOwn(SPECS, kind)) throw new Error('unsupported_issue_kind:' + kind);
  const all = sectionsFromIssue(body);
  const required = SPECS[kind];
  const fields = Object.fromEntries(Object.entries(required).map(([key, label]) => [key, all.get(label) ?? '']));
  const missing = Object.entries(fields).filter(([, value]) => !value).map(([key]) => key);
  return {
    schema: 'agentsam.issue-intake.v1',
    kind,
    readiness: missing.length ? 'incomplete' : 'needs_human_triage',
    agent_execution_authorized: false,
    fields,
    missing_required_fields: missing,
    unrecognized_sections: [...all.keys()].filter(label => !Object.values(required).includes(label)),
    suggested_existing_operations: kind === 'product'
      ? ['repository.inspect', 'planning.goap', 'decision.evaluate', 'artifact.render']
      : ['repository.inspect', 'decision.evaluate', 'artifact.render'],
    note: 'No plan, run, repository mutation, deployment or approval was created.',
  };
}

function cli(argv) {
  let kind = null, file = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--kind') kind = argv[++i];
    else if (argv[i] === '--file') file = argv[++i];
    else if (argv[i] === '--help') {
      process.stdout.write('Usage: node scripts/issues/issue-intake.mjs --kind task|bug|product --file issue-body.md\n');
      return;
    } else throw new Error('unknown_argument:' + argv[i]);
  }
  if (!kind || !file) throw new Error('required: --kind and --file');
  const result = parseIssueIntake(readFileSync(file, 'utf8'), kind);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.missing_required_fields.length) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  try { cli(process.argv.slice(2)); }
  catch (error) { process.stderr.write(String(error?.message || error) + '\n'); process.exitCode = 1; }
}
