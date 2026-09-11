import { getSkill, listSkills, loadSkill } from '../skills/index.js';

function parse(argv = []) {
  const out = { id: '', json: false, references: false };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
    else if (arg === '--references' || arg === '--full') out.references = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown skills option: ${arg}`);
    else if (!out.id) out.id = arg;
    else throw new Error('Only one skill id or alias may be supplied.');
  }
  return out;
}

function help() {
  return [
    'Agent Sam · skills',
    '  agentsam skills                         list portable skills',
    '  agentsam skills <id-or-alias>           print compact skill instructions',
    '  agentsam skills <id-or-alias> --references  include on-demand references',
    '  agentsam skills <id-or-alias> --json    machine-readable skill payload',
    '',
    'Examples:',
    '  agentsam skills quick-bytes',
    '  agentsam skills no-regress --references',
    '',
  ].join('\n');
}

export function runSkills(argv = []) {
  const opts = parse(argv);
  if (opts.help) {
    process.stdout.write(help());
    return null;
  }

  if (!opts.id) {
    const skills = listSkills();
    if (opts.json) process.stdout.write(`${JSON.stringify(skills, null, 2)}\n`);
    else {
      process.stdout.write('Agent Sam · portable skills\n\n');
      for (const skill of skills) {
        const aliases = (skill.aliases || []).length ? ` (${skill.aliases.join(', ')})` : '';
        process.stdout.write(`  ${skill.id}${aliases}\n    ${skill.description}\n`);
      }
      process.stdout.write('\n');
    }
    return skills;
  }

  if (!getSkill(opts.id)) throw new Error(`Unknown skill: ${opts.id}`);
  const loaded = loadSkill(opts.id, { references: opts.references });
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(loaded, null, 2)}\n`);
    return loaded;
  }

  process.stdout.write(`${loaded.instructions.trimEnd()}\n`);
  if (loaded.references?.length) {
    for (const reference of loaded.references) {
      process.stdout.write(`\n---\nReference: ${reference.path}\n---\n\n${reference.content.trimEnd()}\n`);
    }
  }
  return loaded;
}
