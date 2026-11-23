/**
 * Batch 1 universal source registry. Source trees describe capabilities; they
 * NEVER authorize execution, account installation, or publication by themselves.
 *
 * SDK/package source is primary. D1 is a searchable, versioned projection.
 * Live workflow graphs and hook execution records remain D1-owned histories.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CLI_COMMAND_CATALOG } from '../cli/command-catalog.js';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (root, relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const hex = (value) => createHash('sha256').update(value).digest('hex');
const kebab = /^[a-z][a-z0-9-]*$/;

function command({ manager, name, version, executable, words, description, topic='', aliases=[], source }) {
  if (!['npm','pip'].includes(manager) || !words.length || !words.every(w => /^[a-z][a-z0-9-]*$/.test(w))) {
    throw new Error('portable_cli_command_identity_invalid');
  }
  const commandKey = words.join(' ');
  const identity = [manager,name,version,executable,commandKey].join('\x1f');
  return {
    id: 'cli_' + hex(identity).slice(0,24),
    package_manager: manager,
    package_name: name,
    package_version: version,
    executable,
    command_key: commandKey,
    command_words: words,
    aliases: aliases.filter(x => typeof x === 'string' && !x.startsWith('-')),
    display_name: executable + ' ' + commandKey,
    description: description || '',
    topic,
    source_path: source,
    source_sha256: hex(JSON.stringify([identity,description||'',topic,aliases,source])),
    release_state: 'source_only',
    is_active: false,
    // Explicitly not a credential, authorization, release receipt, or dispatch.
    verification: null,
  };
}

/** Static argparse inspection without running the CLI or user-specific operations. */
export function readPythonCli(root=DEFAULT_ROOT, python='python3') {
  const program = path.join(root,'python/agentsam_sdk/registry_cli.py');
  const result = execFileSync(python, [program], {
    cwd: root, encoding:'utf8', timeout:15000, maxBuffer:1024*1024,
    env: { PATH: process.env.PATH || '', PYTHONIOENCODING:'utf-8' },
  });
  const inventory = JSON.parse(result);
  if (inventory.schema !== 'agentsam.python-cli-source.v1' || inventory.package !== 'agentsam-sdk'
      || inventory.executable !== 'agentsam' || !inventory.commands?.length) {
    throw new Error('python_cli_source_not_verifiable');
  }
  return inventory;
}

/** One projection across every registry family, with evidence gates per family. */
export function buildUniversalSource({
  root=DEFAULT_ROOT, pythonInventory, npmCatalog=CLI_COMMAND_CATALOG,
}={}) {
  const pkg=read(root,'package.json');
  const py=pythonInventory || readPythonCli(root);
  if (pkg.name !== '@inneranimalmedia/agentsam-sdk' || !pkg.version || typeof pkg.bin !== 'object') {
    throw new Error('npm_sdk_distribution_identity_invalid');
  }
  if (py.source !== 'python/agentsam_sdk/cli.py' || !py.version) {
    throw new Error('pip_sdk_distribution_identity_invalid');
  }
  if (pkg.bin.agentsam !== 'bin/agentsam') throw new Error('npm_agentsam_entrypoint_changed');
  const commands=[];
  for (const row of npmCatalog) {
    if (!kebab.test(row.id)) throw new Error('nonportable_cli_catalog_id:'+row.id);
    commands.push(command({
      manager:'npm',name:pkg.name,version:pkg.version,executable:'agentsam',
      words:[row.id],description:row.summary,topic:row.topic,aliases:row.aliases||[],
      source:'src/cli/command-catalog.js',
    }));
  }
  // All additional actual npm console executables, not imaginary slash aliases.
  for (const [executable, target] of Object.entries(pkg.bin)) {
    if (executable === 'agentsam') continue;
    if (typeof target !== 'string' || target.startsWith('/') || target.includes('..')
        || !fs.existsSync(path.join(root,target))) {
      throw new Error('npm_bin_target_missing_or_unsafe:'+executable);
    }
    commands.push(command({
      manager:'npm',name:pkg.name,version:pkg.version,executable,
      words:[executable],description:'Published-package entrypoint candidate',
      topic:'binary',source:'package.json',
    }));
  }
  const pySet=new Set();
  for (const item of py.commands) {
    if (!Array.isArray(item.words) || !item.words.length) throw new Error('python_cli_path_invalid');
    const key=item.words.join(' ');
    if (pySet.has(key)) throw new Error('python_cli_path_duplicated:'+key);
    pySet.add(key);
    commands.push(command({
      manager:'pip',name:py.package,version:py.version,executable:py.executable,
      words:item.words,description:item.description,topic:item.words[0],
      source:py.source,
    }));
  }
  const identitySet=new Set();
  for (const row of commands) {
    if (identitySet.has(row.id)) throw new Error('portable_cli_identity_collision:'+row.id);
    identitySet.add(row.id);
  }
  commands.sort((a,b)=>[a.package_manager,a.executable,a.command_key]
    .join('|').localeCompare([b.package_manager,b.executable,b.command_key].join('|')));

  const ops=read(root,'protocol/sam/registry.seed.json');
  if (!Array.isArray(ops.operations)) throw new Error('sam_operation_registry_invalid');
  const tools=ops.operations.map(op=>({
    id:op.id, source:'protocol/sam/registry.seed.json', description:op.summary||'',
    handler_module:op.module||null, handler_action:op.action||null,
    capabilities:op.capabilities||[], risk:op.risk||'unknown',
    state:'source_declared_only', activation:false,
    reason:'SDK operation declarations do not prove deployed handler authorization',
  }));
  const skillCatalog=read(root,'skills/catalog.json');
  if (!Array.isArray(skillCatalog.skills)) throw new Error('skills_catalog_invalid');
  const included=new Set(pkg.files||[]);
  const skills=skillCatalog.skills.map(row=>{
    const dir='skills/'+row.id, src=dir+'/SKILL.md', manifest=dir+'/agentsam.skill.json';
    if (!fs.existsSync(path.join(root,src)) || !fs.existsSync(path.join(root,manifest)))
      throw new Error('skill_source_missing:'+row.id);
    const definition=read(root,manifest);
    if (definition.id !== row.id || definition.schema !== 'agentsam.skill.v1'
        || definition.instructions?.ref !== 'SKILL.md') throw new Error('skill_manifest_drift:'+row.id);
    const packaged=[...included].some(f=>f === dir || f.startsWith(dir+'/'));
    return {
      id:row.id,name:definition.name,slash_trigger:definition.slash?.suggested||null,
      npm_package_name:pkg.name,npm_source_version:pkg.version,
      source:src,content_checksum:hex(fs.readFileSync(path.join(root,src))),
      content_markdown:fs.readFileSync(path.join(root,src),'utf8'),
      description:definition.description||'',
      packaged_in_source_manifest:packaged,
      state:packaged?'package_candidate':'source_only',
      is_published:false,is_active:false,
      reason:'A source package files allowlist is not a published npm tarball receipt',
    };
  });
  const config=read(root,'.agentsam/hooks.json');
  const hooks=Object.entries(config.hooks||{}).flatMap(([event,entries])=>entries.map(row=>({
    id:row.id,event,adapter:row.adapter,
    source:'.agentsam/hooks.json',state:'workspace_local_only',is_active:false,
    reason:'Project hook configuration must never become a global production hook implicitly',
  })));
  // Only packaged binary entrypoints, never all repo maintenance scripts.
  const scripts=Object.entries(pkg.bin).map(([executable,target])=>({
    id:executable,package_name:pkg.name,source:target,
    state:'executable_entrypoint',safe_to_run:false,approval_required:true,
    reason:'A packaged executable is not an approved background script',
  }));
  // The current root rules describe this repository, not user123's workspace.
  const rules=fs.existsSync(path.join(root,'AGENTSAM.md')) ? [{
    id:'sdk-root-guidance',source:'AGENTSAM.md',state:'repo_local_only',
    is_active:false,reason:'Project instructions are not a platform-global rule grant',
  }] : [];
  return {
    schema:'agentsam.universal-source-registry.v1',
    authority:{
      commands:['package.json','src/cli/command-catalog.js','python/pyproject.toml',py.source],
      tools:['protocol/sam/registry.seed.json'],skills:['skills/catalog.json','skills/*/agentsam.skill.json'],
      scripts:['package.json#bin'],hooks:['.agentsam/hooks.json'],
      rules:['AGENTSAM.md'],workflows:['agentsam_workflows','agentsam_workflow_nodes','agentsam_workflow_edges'],
    },
    counts:{commands:commands.length,tools:tools.length,skills:skills.length,
      scripts:scripts.length,hooks:hooks.length,rules:rules.length,workflows:0},
    commands,tools,skills,scripts,hooks,rules,
    workflows:[],workflow_policy:{
      authority:'D1',registration:'versioned_graph_only',
      note:'Live workflows are scoped versioned graphs. Never generate a runnable workflow from a script name or overwrite active revisions.',
    },
    preservation:{
      agentsam_commands:'snapshot legacy, stage commands_next; runtime cutover separately',
      agentsam_hook_execution:'immutable execution evidence',
      agentsam_workflow_runs:'preserve executions',
      agentsam_scripts:'legacy records retained until source and runner proof',
    },
  };
}

const sqlString = value => "'" + String(value).replaceAll("'","''") + "'";
/**
 * Generate deterministic, idempotent D1 seed SQL. Never writes or activates.
 * Existing verified state survives only if the precise source fingerprint matches.
 * A new version or changed source goes back to source_only.
 */
export function commandSeedSql(commands) {
  const keys=new Set();
  const parts=['-- Generated from source; safe staging ONLY (agentsam_commands_next).',
    '-- Apply 20261123_universal_registry_stage.sql first.',
    '-- Publication activation requires separately verified npm/PyPI distribution receipts.',
  ];
  for(const c of commands) {
    if(keys.has(c.id))throw new Error('duplicate_cli_id:'+c.id);
    keys.add(c.id);
    const cols=['id','package_manager','package_name','package_version','executable',
      'command_key','command_words_json','aliases_json','display_name','description',
      'topic','source_path','source_sha256'];
    const values=[c.id,c.package_manager,c.package_name,c.package_version,c.executable,
      c.command_key,JSON.stringify(c.command_words),JSON.stringify(c.aliases),
      c.display_name,c.description,c.topic,c.source_path,c.source_sha256];
    parts.push('INSERT INTO agentsam_commands_next ('+cols.join(',')+') VALUES ('+
      values.map(sqlString).join(',')+') ON CONFLICT(id) DO UPDATE SET '+
      cols.slice(1).map(col=>col+'=excluded.'+col).join(',')+','+
      "release_state=CASE WHEN agentsam_commands_next.source_sha256=excluded.source_sha256 THEN agentsam_commands_next.release_state ELSE 'source_only' END,"+
      "is_active=CASE WHEN agentsam_commands_next.source_sha256=excluded.source_sha256 THEN agentsam_commands_next.is_active ELSE 0 END,"+
      "verified_at=CASE WHEN agentsam_commands_next.source_sha256=excluded.source_sha256 THEN agentsam_commands_next.verified_at ELSE NULL END,"+
      "verification_json=CASE WHEN agentsam_commands_next.source_sha256=excluded.source_sha256 THEN agentsam_commands_next.verification_json ELSE '{}' END,"+
      "updated_at=unixepoch();");
  }
  return parts.join('\n')+'\n';
}

/** Stage all source skills as disabled evidence; publish only after tarball proof.
 * Scope is platform with NULL account, so user123 can discover verified releases
 * later without sharing the author's private account or copying user records.
 */
export function skillSeedSql(skills) {
  const ids=new Set();
  const statements=['-- Generated staging for agentsam_skill_next; none auto-published or activated.'];
  for (const s of skills) {
    if(ids.has(s.id))throw new Error('duplicate_skill_id:'+s.id);
    ids.add(s.id);
    if(!s.slash_trigger || !/^\/[a-z0-9][a-z0-9-]*$/.test(s.slash_trigger))
      throw new Error('invalid_skill_trigger:'+s.id);
    const id='sdk_skill_'+hex(s.id).slice(0,24);
    const cols=['id','scope_type','name','slash_trigger','npm_package_name','npm_version',
      'is_published','is_active','description','content_markdown','file_path','content_checksum',
      'access_mode','metadata_json'];
    const vals=[id,'platform',s.name,s.slash_trigger,s.npm_package_name,s.npm_source_version,
      0,0,s.description,s.content_markdown,s.source,s.content_checksum,'read_only',
      JSON.stringify({origin:'sdk_source',source_id:s.id,packaged_candidate:s.packaged_in_source_manifest})];
    statements.push('INSERT INTO agentsam_skill_next ('+cols.join(',')+') VALUES ('+
      vals.map(v=>typeof v==='number'?String(v):sqlString(v)).join(',')+
      ') ON CONFLICT(id) DO UPDATE SET '+
      cols.filter(k=>!['id','is_published','is_active'].includes(k))
        .map(k=>k+'=excluded.'+k).join(',')+','+
      "is_published=CASE WHEN agentsam_skill_next.content_checksum=excluded.content_checksum THEN agentsam_skill_next.is_published ELSE 0 END,"+
      "is_active=CASE WHEN agentsam_skill_next.content_checksum=excluded.content_checksum THEN agentsam_skill_next.is_active ELSE 0 END,"+
      "updated_at=datetime('now');");
  }
  return statements.join('\n')+'\n';
}
