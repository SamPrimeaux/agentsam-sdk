/** Repository semantic graph from an existing Rust Machine receipt; NEVER walks the filesystem. */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { createHash } from 'node:crypto';
import { analyzeSemanticSource, normalizeSemanticTokens, resolveSemanticLocalImport } from './merkle/semantic.js';

export const REPOSITORY_CRAWL_SCHEMA = 'agentsam.repository.crawl.v1';
const MAX_SOURCE_BYTES = 512 * 1024;
const sha = (v) => createHash('sha256').update(v).digest('hex');
const stable = (v) => JSON.stringify(v);
const normPath = (p) => String(p).replaceAll('\\', '/');
const unique = (arr) => [...new Set(arr)].sort();

/** Load only Machine's bounded receipt or its explicit full artifact; reject swapped artifact roots. */
export function machineEvidence(receipt, { root = receipt.root } = {}) {
  if (receipt.schema !== 'agentsam.machine.receipt.v1' || receipt.capability !== 'machine.inspect') {
    throw new TypeError('expected the canonical machine.inspect receipt');
  }
  const base = fs.realpathSync(root);
  if (fs.realpathSync(receipt.root) !== base) throw new Error('machine receipt root mismatch');
  let facts = receipt.facts || [];
  let edges = receipt.edges || [];
  const directory = receipt.detail?.artifact_dir;
  if (directory) {
    const expected = path.join(base, '.agentsam', 'machine', 'runs', receipt.run_id);
    if (path.resolve(directory) !== expected || fs.realpathSync(directory) !== expected) throw new Error('untrusted Machine artifact directory');
    facts = JSON.parse(fs.readFileSync(path.join(expected, 'inventory.json'), 'utf8'));
    edges = JSON.parse(fs.readFileSync(path.join(expected, 'graph.json'), 'utf8'));
  } else if (receipt.summary?.facts_total > facts.length || receipt.summary?.edges_total > edges.length) {
    throw new Error('truncated Machine receipt without complete artifacts');
  }
  return { root: base, facts, edges };
}

/** Content reads are limited to exact hashed facts from Machine, never new discovery. */
function verifiedText(root, fact, errors) {
  if (!fact || fact.fs_kind !== 'file' || fact.size > MAX_SOURCE_BYTES) return null;
  const candidate = path.resolve(root, fact.path);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) throw new Error('Machine fact escapes root');
  try {
    const actual = fs.realpathSync(candidate);
    if (actual !== root && !actual.startsWith(root + path.sep)) throw new Error('Machine source escaped root through symlink');
    const st = fs.lstatSync(candidate);
    if (!st.isFile() || st.isSymbolicLink() || st.size !== fact.size) throw new Error('file changed since Machine scan');
    const bytes = fs.readFileSync(candidate);
    if (sha(bytes) !== fact.sha256) throw new Error('hash mismatch since Machine scan');
    return bytes.toString('utf8');
  } catch (e) {
    errors.push({ path: fact.path, operation: 'verified_read', reason: e.message });
    return null;
  }
}

function kindFor(fact) {
  const name = fact.path.toLowerCase();
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(name) || /(^|\/)(__tests__|tests?)\//.test(name)) return 'test';
  if (/(^|\/)migrations?\//.test(name) || name.endsWith('.sql')) return 'migration';
  if (name.endsWith('.schema.json')) return 'schema';
  if (fact.source?.kind === 'asset') return 'asset';
  if (fact.source?.kind === 'code') return 'source_module';
  return 'file';
}

/** Enrich Machine facts with existing Repository AST parsing and manifest semantics. */
export function createRepositoryCrawl(receipt, options = {}) {
  const { root, facts, edges: machineEdges } = machineEvidence(receipt, options);
  const errors = [...(receipt.errors || []).map(e => ({ path: e.path, operation: e.operation, reason: e.message }))];
  const resources = new Map();
  const edges = new Map();
  const sources = [];
  const add = (r) => { if (!resources.has(r.id)) resources.set(r.id, r); };
  const link = (from, to, type, evidence) => {
    if (!resources.has(from) || !resources.has(to)) return;
    const id = `edge:${sha(stable([from,to,type])).slice(0,24)}`;
    edges.set(id, { id, from, to, type, evidence });
  };
  add({ id: 'repository:.', kind: 'repository', path: '.', provenance: 'machine.inspect' });
  const files = new Map();
  for (const fact of [...facts].sort((a,b)=>a.path.localeCompare(b.path))) {
    if (fact.fs_kind !== 'file' || !fact.path || path.posix.isAbsolute(normPath(fact.path)) || normPath(fact.path).split('/').includes('..')) continue;
    const id = `file:${normPath(fact.path)}`;
    files.set(normPath(fact.path), fact);
    add({ id, kind: kindFor(fact), path: normPath(fact.path), hash: fact.sha256,
      bytes: fact.size, source_type: fact.source?.type ?? null, provenance: `machine:${fact.id}` });
    link('repository:.', id, 'contains', { fact_id: fact.id });
  }
  const fileSet = new Set(files.keys());
  const packageRoots = [];
  for (const [p, fact] of files) {
    if (path.posix.basename(p) !== 'package.json') continue;
    const source = verifiedText(root, fact, errors);
    if (source === null) continue;
    try {
      const pkg = JSON.parse(source);
      if (!pkg.name) continue;
      const pkgId = `package:${p}`;
      add({ id: pkgId, kind: 'package', path: p, name: pkg.name, version: pkg.version || null, provenance: `file:${p}` });
      packageRoots.push({ prefix: path.posix.dirname(p), id: pkgId, name: pkg.name });
      link('repository:.', pkgId, 'contains', { path: p });
      link(pkgId, `file:${p}`, 'configured_by', { path: p });
      for (const [dep, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
        add({ id: `dependency:${dep}`, kind: 'dependency', name: dep, provenance: `file:${p}` });
        link(pkgId, `dependency:${dep}`, 'depends_on', { manifest: p, version });
      }
    } catch (e) { errors.push({ path:p, operation:'parse_manifest', reason:e.message }); }
  }
  packageRoots.sort((a,b)=>b.prefix.length-a.prefix.length);
  for (const [p, fact] of files) {
    const nearest = packageRoots.find(pkg => pkg.prefix === '.' || p.startsWith(pkg.prefix + '/'));
    if (nearest) link(nearest.id, `file:${p}`, 'contains', { package: nearest.name });
    if (!/\.[cm]?[jt]sx?$/.test(p) || fact.size > MAX_SOURCE_BYTES) continue;
    const content = verifiedText(root, fact, errors);
    if (content === null) continue;
    const ast = analyzeSemanticSource(p, content);
    const normalized_hash = sha(normalizeSemanticTokens(content));
    sources.push({ path: p, hash: fact.sha256, normalized_hash, symbols: ast.symbols,
      imports: ast.imports, package: nearest?.name || null, repository: options.repository || path.basename(root) });
    for (const name of ast.symbols) {
      const sym = `symbol:${p}#${name}`;
      add({ id: sym, kind: 'symbol', name, path:p, provenance:`file:${p}` });
      link(`file:${p}`, sym, 'declares', { parser: 'typescript', source: p, declaration: name });
    }
    for (const specifier of ast.imports) {
      const target = resolveSemanticLocalImport(p, specifier, fileSet);
      if (target) link(`file:${p}`, `file:${target}`, 'imports', { specifier, parser:'typescript' });
      else if (!specifier.startsWith('.')) {
        add({ id:`dependency:${specifier}`,kind:'dependency',name:specifier,provenance:`file:${p}` });
        link(`file:${p}`, `dependency:${specifier}`, 'imports', { specifier, parser:'typescript' });
      }
    }
  }
  // Manifest and SQL facts below were already discovered by Machine. No second traversal.
  for (const [p, fact] of files) {
    if (p === 'protocol/capabilities/manifest.json') {
      const text = verifiedText(root, fact, errors);
      if (text !== null) {
        try {
          const catalog = JSON.parse(text);
          for (const key of Object.keys(catalog.capabilities || {}).sort()) {
            const cap = `capability:${key}`;
            add({ id:cap, kind:'capability', name:key, provenance:`file:${p}`, status:catalog.capabilities[key]?.status || null });
            link(cap, `file:${p}`, 'configured_by', { manifest:p });
          }
        } catch (e) { errors.push({ path:p, operation:'parse_capabilities', reason:e.message }); }
      }
    }
    if (p.endsWith('.sql') && (p.includes('migrations/') || p.includes('migration/'))) {
      const text = verifiedText(root, fact, errors);
      if (text === null) continue;
      for (const match of text.replace(/--[^\r\n]*/g, '').matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([\w.]+)["`]?/gi)) {
        const table = `database_table:${match[1]}`;
        add({ id:table, kind:'database_table', name:match[1], provenance:`file:${p}` });
        link(`file:${p}`, table, 'defines', { statement:'CREATE TABLE', path:p });
      }
    }
    if (!/(^|\/)wrangler(?:\.[\w.-]+)?\.(toml|jsonc?)$/i.test(p)) continue;
    const configText = verifiedText(root, fact, errors);
    if (configText === null) continue;
    let name = p, configured = [];
    if (p.endsWith('.toml')) {
      let section = '', current = {};
      const finish = () => {
        if (current.binding && section) configured.push({ category:section.split('.').at(-1), binding:current.binding,
          target:current.bucket_name || current.database_name || current.index_name || current.queue || null });
      };
      for (const line of configText.split(/\r?\n/)) {
        const heading = line.match(/^\s*\[\[?([^\]]+)\]\]?\s*(?:#.*)?$/);
        if (heading) { finish(); section=heading[1];current={};continue; }
        const kv = line.match(/^\s*([\w_]+)\s*=\s*["']([^"']+)["']/);
        if (!kv) continue;
        if (!section && kv[1]==='name') name=kv[2];
        if (['binding','bucket_name','database_name','index_name','queue'].includes(kv[1])) current[kv[1]]=kv[2];
      }
      finish();
    } else {
      try {
        // Configuration observation is intentionally limited to binding names, never vars/secrets.
        const diagnostics = [];
        const conf = parseJsonc(configText, diagnostics, { allowTrailingComma:true });
        if (diagnostics.length || !conf || typeof conf !== 'object') throw new Error('invalid wrangler JSONC');
        name = conf.name || p;
        for (const category of ['r2_buckets','d1_databases','vectorize','kv_namespaces']) {
          for (const entry of conf[category] || []) if (entry.binding) configured.push({ category,binding:entry.binding,
            target:entry.bucket_name || entry.database_name || entry.index_name || null });
        }
      } catch (e) { errors.push({ path:p, operation:'parse_wrangler', reason:e.message }); }
    }
    const worker=`worker:${p}`;
    add({id:worker,kind:'worker',name,path:p,provenance:`file:${p}`,evidence_status:'configured_not_deployed'});
    link(worker,`file:${p}`,'configured_by',{config:p});
    for (const conf of configured) {
      const binding=`binding:${p}:${conf.binding}`;
      add({id:binding,kind:'binding',name:conf.binding,category:conf.category,provenance:`file:${p}`});
      link(worker,binding,'binds_to',{config:p,declared:true});
      if (conf.target) {
        const kind = {r2_buckets:'r2_bucket',d1_databases:'d1_database',vectorize:'vectorize_index',kv_namespaces:'kv_namespace'}[conf.category] || 'external_resource';
        const target=`${kind}:${conf.target}`;
        add({id:target,kind,name:conf.target,provenance:`file:${p}`,evidence_status:'configured_not_verified'});
        link(binding,target,'configured_by',{config:p});
      }
    }
  }
  for (const edge of machineEdges) {
    if (edge.type !== 'asset_reference' || !edge.from?.startsWith('file:')) continue;
    const id = String(edge.to || '');
    if (!id.startsWith('asset:')) continue;
    add({ id, kind:'asset_reference', path:id.slice(6), provenance:'machine.inspect' });
    link(edge.from, id, 'references', { machine_edge_id:edge.id, ...edge.evidence });
  }
  const sortedResources = [...resources.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const sortedEdges = [...edges.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const snapshot_hash = sha(stable({ resources: sortedResources, edges: sortedEdges }));
  return { schema:REPOSITORY_CRAWL_SCHEMA, capability:'repository.crawl', schema_version:1,
    repository: options.repository || path.basename(root), machine_run_id: receipt.run_id,
    snapshot_id:`repo_${snapshot_hash.slice(0,24)}`, snapshot_hash:`sha256:${snapshot_hash}`,
    counts:{ files:files.size, resources:sortedResources.length, edges:sortedEdges.length, sources:sources.length },
    resources:sortedResources, edges:sortedEdges, sources:sources.sort((a,b)=>a.path.localeCompare(b.path)),
    errors, provenance:{ collector:'agentsam-machine', parser:'agentsam-repository/merkle/semantic', source_mutated:false } };
}
