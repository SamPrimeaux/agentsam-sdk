/**
 * SAM artifact composer: deterministic, side-effect free, and evidence-bound.
 * Deliverables are a view over caller-provided findings, not model inventions.
 */
import { createHash } from 'node:crypto';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const md = value => String(value ?? '').replace(/[\\`*_{}\[\]<>|]/g, '\\$&').replace(/\r?\n/g, ' ');
const sha = value => createHash('sha256').update(value).digest('hex');
const safeArray = (value, label, max = 250) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) throw new TypeError('artifact_invalid_' + label);
  return value;
};
function item(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('artifact_invalid_' + label);
  return value;
}
function text(value, max = 10000) {
  const valueText = String(value ?? '');
  if (valueText.length > max) throw new TypeError('artifact_text_too_long');
  return valueText;
}
function evidence(value) {
  return safeArray(value, 'evidence').map((raw, i) => {
    const x = item(raw, 'evidence');
    if (!x.ref || typeof x.ref !== 'string') throw new TypeError('artifact_evidence_ref_required:' + i);
    return { ref: text(x.ref, 400), label: text(x.label || x.ref, 300), source: text(x.source || '', 500) };
  });
}
export function renderSamArtifact(input = {}) {
  item(input, 'input');
  const title = text(input.title || '', 240).trim();
  if (!title) throw new TypeError('artifact_title_required');
  const summary = text(input.summary || '', 20000);
  const findings = safeArray(input.findings, 'findings').map((raw, i) => {
    const x = item(raw, 'finding');
    return { id: text(x.id || 'F-' + (i + 1), 100), title: text(x.title, 500),
      detail: text(x.detail, 10000), evidenceRefs: safeArray(x.evidenceRefs, 'evidence_refs', 100).map(v=>text(v,400)),
      status: text(x.status || 'observation', 80) };
  });
  const steps = safeArray(input.steps, 'steps').map((raw, i) => {
    const x = item(raw, 'step');
    return { id: text(x.id || 'S-' + (i + 1), 100), title: text(x.title, 500),
      acceptance: text(x.acceptance, 5000), status: text(x.status || 'proposed', 80) };
  });
  const citations = evidence(input.evidence);
  const refs = new Set(citations.map(x=>x.ref));
  for (const f of findings) for (const ref of f.evidenceRefs) {
    if (!refs.has(ref)) throw new TypeError('artifact_unknown_evidence_ref:' + ref);
  }
  const sections = safeArray(input.sections, 'sections', 100).map((raw, i) => {
    const x = item(raw, 'section');
    return { id: text(x.id || 'section-' + (i + 1), 120), sku: text(x.sku || 'sam.section.generic', 180),
      heading: text(x.heading || '', 500), description: text(x.description || '', 5000),
      assetRef: x.assetRef ? text(x.assetRef, 300) : null };
  });
  if (!summary && !findings.length && !steps.length && !sections.length)
    throw new TypeError('artifact_content_required');
  const meta = { kind: text(input.kind || 'audit', 80), fidelity: text(input.fidelity || 'low', 50),
    schema: 'sam.artifact.v1', evidence_bound: true };
  const content = { title, summary, findings, steps, evidence: citations, sections, ...meta };

  const findingsHtml = findings.map(f=>`<article class="entry"><div class="eyebrow">${esc(f.id)} · ${esc(f.status)}</div><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p><small>${f.evidenceRefs.length ? 'Evidence: ' + f.evidenceRefs.map(esc).join(', ') : 'No evidence attached — unverified finding'}</small></article>`).join('');
  const stepsHtml = steps.map(s=>`<article class="entry"><div class="eyebrow">${esc(s.id)} · ${esc(s.status)}</div><h3>${esc(s.title)}</h3><p>${esc(s.acceptance)}</p></article>`).join('');
  const sectionsHtml = sections.map((s,i)=>`<section class="wireframe"><small>${esc(String(i + 1).padStart(2, '0'))} · ${esc(s.sku)}</small><h3>${esc(s.heading)}</h3><p>${esc(s.description)}</p>${s.assetRef ? `<div class="asset">Media reference: ${esc(s.assetRef)}</div>` : ''}</section>`).join('');
  const evidenceHtml = citations.map(x=>`<li><strong>${esc(x.label)}</strong><code>${esc(x.ref)}</code><span>${esc(x.source)}</span></li>`).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>:root{color-scheme:light;--ink:#1c2130;--muted:#606779;--line:#dce0e6;--accent:#594ca0}*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,-apple-system,sans-serif;color:var(--ink);background:#f7f8fa}main{max-width:1100px;margin:auto;padding:48px 24px 100px}.eyebrow,small{font:12px/1.45 ui-monospace,monospace;letter-spacing:.04em;color:var(--muted)}h1{font-size:clamp(35px,6vw,76px);line-height:1.04;letter-spacing:-.045em;margin:12px 0 30px}h2{font-size:26px;margin:50px 0 15px}h3{margin:8px 0;font-size:19px}p{white-space:pre-wrap}.lede{font-size:21px;max-width:760px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.entry,.wireframe{background:#fff;border:1px solid var(--line);padding:24px;border-radius:10px}.entry p{font-size:15px}.wireframe{border:2px dashed #b9bdc8;border-radius:0;min-height:150px}.wireframe+.wireframe{border-top:0}.wireframe .asset{margin-top:20px;background:repeating-linear-gradient(45deg,#e9e9ee,#e9e9ee 12px,#f4f4f8 12px,#f4f4f8 24px);text-align:center;padding:48px 8px;border:1px solid #b9bdc8;font-size:12px}ul{padding-left:24px}li{padding:9px 0;border-bottom:1px solid var(--line)}code{display:block;font-size:12px;word-break:break-all;color:var(--accent)}@media print{body{background:white}main{padding:0}.entry,.wireframe{break-inside:avoid}}</style></head><body><main>
<div class="eyebrow">SYSTEMATIC AUTONOMOUS MACHINERY · ${esc(meta.kind)} · ${esc(meta.fidelity)} fidelity</div><h1>${esc(title)}</h1><p class="lede">${esc(summary)}</p>
${findings.length?`<h2>Findings</h2><div class="grid">${findingsHtml}</div>`:''}
${sections.length?`<h2>Structured wireframes</h2>${sectionsHtml}`:''}
${steps.length?`<h2>Implementation plan</h2><div class="grid">${stepsHtml}</div>`:''}
<h2>Evidence & provenance</h2>${citations.length?`<ul>${evidenceHtml}</ul>`:'<p>No execution evidence supplied. This artifact is a draft, not a verified audit.</p>'}
</main></body></html>`;
  const markdown = [
    '# ' + md(title), '', '> SAM · ' + md(meta.kind) + ' · ' + md(meta.fidelity) + ' fidelity', '',
    md(summary), '',
    ...findings.flatMap(f=>['## '+md(f.id)+' — '+md(f.title),'',md(f.detail),'','Status: '+md(f.status),
      'Evidence: '+(f.evidenceRefs.join(', ')||'none (unverified)'), '']),
    ...(sections.length?['## Structured wireframes','',...sections.flatMap(s=>['### '+md(s.sku)+' — '+md(s.heading),'',md(s.description),s.assetRef?'Asset: '+md(s.assetRef):'',''])]:[]),
    ...(steps.length?['## Implementation plan','',...steps.flatMap(s=>['### '+md(s.id)+' — '+md(s.title),'','Acceptance: '+md(s.acceptance),'Status: '+md(s.status),''])]:[]),
    '## Evidence & provenance','', ...(citations.length?citations.map(e=>'- '+md(e.label)+' ('+md(e.ref)+') '+md(e.source)):['Evidence references are caller-supplied and require independent verification.']), ''
  ].join('\n');
  return {
    schema:'sam.artifact.bundle.v1', title, kind:meta.kind, verified: false,
    files: { 'report.html': html, 'report.md': markdown },
    document: content,
    manifest: {schema:'sam.artifact.manifest.v1', kind:meta.kind, title, evidence:citations.map(e=>e.ref),
      files:{'report.html':sha(html),'report.md':sha(markdown)}, source:'caller-supplied', verified:false, verification_state:'awaiting_authority_provenance_check'}
  };
}
