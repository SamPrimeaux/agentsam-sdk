import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';

const root = fileURLToPath(new URL('../../packages/catalog/', import.meta.url));
const read = (name) => JSON.parse(readFileSync(path.join(root, name), 'utf8'));
const index = () => read('generated/packages.json');
const topics = () => read('topics/runtime.json').topics;
const questions = () => read('assist/questions.json').questions;
const rules = () => read('assist/rules.json').rules;

function flags(args) {
  const values = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const [k, ...inline] = args[i].slice(2).split('=');
      values[k] = inline.length ? inline.join('=') : (['json', 'help'].includes(k) ? true : args[++i]);
    } else positional.push(args[i]);
  }
  return { values, positional };
}

function compactJson(value, asJson) {
  if (asJson) console.log(JSON.stringify(value, null, 2));
  else if (value.title) {
    console.log(value.title + '\n' + (value.summary || value.purpose || ''));
    for (const [key, label] of [['use_when','Use when'], ['avoid_when','Avoid when'], ['commands','Commands']]) {
      if (value[key]?.length) console.log('\n' + label + ':\n' + value[key].map(x => '  - ' + x).join('\n'));
    }
    if (value.catalog_status && value.catalog_status !== 'classified')
      console.log('\nCatalog status: ' + value.catalog_status + ' (draft, not verified product authority)');
  } else {
    console.log(value.recommendation?.title || 'No exact recommendation');
    for (const why of value.recommendation?.why || []) console.log('  - ' + why);
    for (const start of value.recommendation?.start || []) console.log('  ' + start);
    for (const learn of value.recommendation?.learn || []) console.log('  ' + learn);
    for (const note of value.notes || []) console.log('  Note: ' + note);
    if (!value.recommendation) console.log('Supply more information via agentsam assist.');
  }
}

export function explainCatalog(argv = []) {
  const { values, positional } = flags(argv);
  if (values.help || !positional.length) {
    console.log('Usage: agentsam explain <rust|workers|wasm|rapid-rust|package NAME> [--json]');
    return 0;
  }
  const isPackage = positional[0] === 'package';
  const term = (isPackage ? positional.slice(1) : positional).join(' ').toLowerCase();
  let result;
  if (isPackage) {
    const candidates = index().packages;
    result = candidates.find(p => [p.id, p.name, p.registry?.name].filter(Boolean)
      .some(name => name.toLowerCase() === term || name.toLowerCase() === '@inneranimalmedia/' + term));
    if (result) result = { ...result, title: result.name, summary: result.purpose };
  } else result = topics()[term] || null;
  if (!result) {
    console.error('Unknown catalog topic or package: ' + term);
    return 2;
  }
  compactJson(result, !!values.json);
  return 0;
}

export function recommendCatalog(answers) {
  const known = new Map(questions().map(q => [q.id, new Set(q.options.map(o => o[0]))]));
  for (const [key, value] of Object.entries(answers)) {
    if (!known.has(key) || !known.get(key).has(value)) {
      throw new Error('Unsupported answer ' + key + '=' + value);
    }
  }
  const hits = rules().filter(rule => {
    const all = Object.entries(rule.when || {}).every(([key, value]) => answers[key] === value);
    const anyEntries = Object.entries(rule.when_any || {});
    const any = !anyEntries.length || anyEntries.some(([key, options]) => options.includes(answers[key]));
    return all && any && (Object.keys(rule.when || {}).length + anyEntries.length > 0);
  }).sort((a,b) => b.priority - a.priority);
  const preference = answers.preferred_runtime;
  const compatible = !preference || preference === 'any' ? hits : hits.filter(rule => {
    const language = String(rule.recommend.language || '').toLowerCase();
    return language.includes(preference) ||
      (preference === 'typescript' && language.includes('javascript'));
  });
  const notes = [];
  if (preference && preference !== 'any' && hits.length && !compatible.length)
    notes.push('No rule fits all declared constraints and the preferred runtime. Review the constraints instead of silently overriding the preference.');
  if (answers.portability === 'portable' && ['process','libraries','filesystem'].includes(answers.native_access))
    notes.push('A strict native-access requirement limits cross-host portability; isolate it behind an adapter.');
  if (answers.browser_surface === 'yes' && answers.goal !== 'web-ui')
    notes.push('A browser/UI surface needs its own frontend even when the core service uses another runtime.');
  return { answers, recommendation: compatible[0]?.recommend ?? null, rule_id: compatible[0]?.id ?? null,
    alternatives: compatible.slice(1,4).map(r => ({ id: r.id, title: r.recommend.title })), notes };
}

const presets = {
  'reusable-native-logic': { goal: 'native-core', reusable_core: 'yes', execution: 'multiple' },
  'edge-api': { goal: 'api', execution: 'edge', lifetime: 'short', native_access: 'none' },
  'long-running-service': { goal: 'service', execution: 'server', lifetime: 'long' },
  'desktop-app': { goal: 'desktop', execution: 'desktop' },
  'browser-ui': { goal: 'web-ui', execution: 'browser' },
};

export async function runCatalog(kind, argv = [], { interactive = process.stdin.isTTY } = {}) {
  if (kind === 'explain') return explainCatalog(argv);
  const { values } = flags(argv);
  if (values.help) {
    console.log('Usage: agentsam choose runtime --goal reusable-native-logic [--json]\n' +
      '       agentsam assist [--answers JSON] [--json]');
    return 0;
  }
  let answers;
  if (values.answers) {
    try { answers = JSON.parse(values.answers); }
    catch { console.error('Invalid JSON for --answers'); return 2; }
    if (!answers || Array.isArray(answers) || typeof answers !== 'object') {
      console.error('--answers must be a JSON object'); return 2;
    }
  } else if (kind === 'choose') {
    answers = presets[values.goal];
    if (!answers) {
      console.error('Choose --goal: ' + Object.keys(presets).join(', '));
      return 2;
    }
  } else {
    if (!interactive) {
      console.error('Non-interactive use: agentsam assist --answers \'{"goal":"api","execution":"edge"}\' --json');
      return 2;
    }
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    answers = {};
    try {
      for (const q of questions()) {
        console.log('\n' + q.prompt);
        q.options.forEach(([_, title], i) => console.log('  ' + (i + 1) + '. ' + title));
        const raw = await prompt.question('Choice: ');
        const option = q.options[Number(raw) - 1];
        if (!option) { console.error('Invalid choice'); return 2; }
        answers[q.id] = option[0];
      }
    } finally { prompt.close(); }
  }
  let result;
  try { result = recommendCatalog(answers); }
  catch (e) { console.error(e.message); return 2; }
  compactJson(result, !!values.json);
  return result.recommendation ? 0 : 2;
}
