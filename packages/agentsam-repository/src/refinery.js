/** Evidence-only reuse proposals. This module neither scans nor modifies source trees. */
import { createHash } from 'node:crypto';

export const REFINERY_SCHEMA = 'agentsam.refinery.proposal.v1';
const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const ratio = (a,b) => { const x=new Set(a),y=new Set(b); const n=[...x].filter(v=>y.has(v)).length; return n / (x.size + y.size - n || 1); };
function sourceKey(source) { return `${source.repository}:${source.path}`; }
function compare(a,b) {
  if (a.hash === b.hash) return { type:'exact_hash', score:1 };
  if (a.normalized_hash === b.normalized_hash) return { type:'normalized_hash', score:.98 };
  const sym = ratio(a.symbols, b.symbols);
  const imp = ratio(a.imports, b.imports);
  const nameA = a.path.split('/').pop(), nameB=b.path.split('/').pop();
  if (a.symbols.length >= 2 && b.symbols.length >= 2 && sym >= .66 && (nameA === nameB || imp >= .5)) {
    return { type:'symbol_signature', score: Number((sym*.8+imp*.2).toFixed(3)) };
  }
  return null;
}
function canonicalOwner(implementations, graphs) {
  const names = [...new Set(implementations.map(s => s.package).filter(Boolean))];
  const explicit = names.filter(name => name.startsWith('@inneranimalmedia/'));
  if (explicit.length === 1) return { package:explicit[0], confidence:'manifest', evidence:['package.json:name'] };
  if (names.length === 1) return { package:names[0], confidence:'manifest', evidence:['package.json:name'] };
  return null;
}

/** Find cross-repository candidate pairs using indexed deterministic fingerprints. */
export function findRefineryCandidates(graphs, { limit = 100 } = {}) {
  if (!Array.isArray(graphs) || graphs.length < 2) throw new TypeError('mine requires at least two repository graphs');
  for (const graph of graphs) if (graph.schema !== 'agentsam.repository.crawl.v1') throw new TypeError('expected repository.crawl graphs');
  const all = graphs.flatMap(graph => graph.sources.map(s => ({ ...s, repository:graph.repository, snapshot_id:graph.snapshot_id })));
  const candidates = new Map();
  const buckets = new Map();
  for (const s of all) {
    if (s.path.includes('/__tests__/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(s.path)) continue;
    const keys = [`hash:${s.hash}`,`normalized:${s.normalized_hash}`];
    const basename=s.path.split('/').pop();
    if (basename !== 'index.js' && basename !== 'index.ts') keys.push(`name:${basename}`);
    for (const symbol of s.symbols) if (symbol.length >= 5) keys.push(`symbol:${symbol}`);
    for (const key of keys) {
      const entries = buckets.get(key) || [];
      entries.push(s);
      buckets.set(key, entries);
    }
  }
  const pairs = new Map();
  for (const entries of buckets.values()) {
    if (entries.length > 100) continue; // common exports are not useful evidence
    for (let i=0;i<entries.length;i++) for (let j=i+1;j<entries.length;j++) {
      const a=entries[i],b=entries[j];
      if (a.repository === b.repository) continue;
      const [first,second] = [a,b].sort((x,y)=>sourceKey(x).localeCompare(sourceKey(y)));
      const key=sourceKey(first)+'|'+sourceKey(second);
      if (!pairs.has(key)) pairs.set(key,[first,second]);
    }
  }
  for (const [key,[a,b]] of [...pairs.entries()].sort(([x],[y])=>x.localeCompare(y))) {
    const match=compare(a,b);
    if (!match || match.score < .7) continue;
    const owner=canonicalOwner([a,b], graphs);
    const implementations=[a,b].map(s => ({repository:s.repository, path:s.path, source_hash:s.hash,
      normalized_hash:s.normalized_hash, snapshot_id:s.snapshot_id, declared_package:s.package,
      symbols:s.symbols, imports:s.imports }));
    const id='cand_'+digest(implementations.map(s=>[s.repository,s.path,s.source_hash])).slice(0,20);
    candidates.set(key,{ candidate_id:id, capability_hint:null, match,
      implementations, likely_owner:owner,
      evidence:[{type:match.type, source_paths:implementations.map(x=>`${x.repository}:${x.path}`)}],
      differences:{ symbols:{first:a.symbols.filter(x=>!b.symbols.includes(x)), second:b.symbols.filter(x=>!a.symbols.includes(x))},
        imports:{first:a.imports.filter(x=>!b.imports.includes(x)), second:b.imports.filter(x=>!a.imports.includes(x))} },
      recommendation: owner ? 'review_for_canonical_reuse' : 'review_ownership_before_promotion',
      promotion:{ approval_required:true, source_mutated:false,
        steps:['compare behavior and licenses','identify missing canonical behavior','add parity tests','obtain approval','migrate verified consumers','run existing package/security/product proof checks'] } });
  }
  const found=[...candidates.values()].sort((a,b)=>b.match.score-a.match.score||a.candidate_id.localeCompare(b.candidate_id));
  return { schema: REFINERY_SCHEMA, capability:'repository.mine', status:'proposals_only',
    sources: graphs.map(g=>({repository:g.repository,snapshot_id:g.snapshot_id,machine_run_id:g.machine_run_id,files:g.counts.files})),
    candidates:found.slice(0,limit), counts:{ compared_repositories:graphs.length, candidate_pairs:found.length, returned:Math.min(limit,found.length) },
    provenance:{ approach:'hash+existing-semantic-ast', model_required:false, source_mutated:false } };
}

/** Aggregate existing gate receipts; this never runs tools or treats a proposed patch as approved. */
export function aggregateRefineryQuality(candidate, { approved = false, checks = [] } = {}) {
  if (!candidate?.candidate_id || !Array.isArray(candidate.implementations)) throw new TypeError('expected a refinery candidate');
  if (!Array.isArray(checks)) throw new TypeError('checks must be an array');
  const required = ['package.audit','package.verify','security.scan','consumer.parity','product.proof'];
  const byTool = new Map(checks.map(c => [c.tool,c]));
  const gates = required.map(tool => {
    const check = byTool.get(tool);
    const status = ['passed','failed'].includes(check?.status) && check?.receipt_ref ? check.status : 'missing';
    return { tool, status, receipt_ref: status === 'missing' ? null : check.receipt_ref };
  });
  const status = !approved ? 'awaiting_approval' : gates.some(g=>g.status==='failed') ? 'blocked' :
    gates.every(g=>g.status==='passed') ? 'verified' : 'incomplete';
  return { schema:'agentsam.refinery.quality.v1', candidate_id:candidate.candidate_id,
    approved, status, gates, source_mutated:false, authority:'external_gate_receipts_only' };
}
