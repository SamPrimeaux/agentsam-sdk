import { stateId } from './naming.js';

const human = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2');

/** Deterministic: the same manifest always yields the same screenplay. No model, no network. */
export function renderScreenplay(manifest) {
  const byState = new Map();
  for (const asset of manifest.assets.filter((a) => a.stateId)) {
    if (!byState.has(asset.stateId)) byState.set(asset.stateId, []);
    byState.get(asset.stateId).push(asset);
  }
  const scenes = [];
  for (const flow of manifest.flows) for (const step of flow.steps) for (const state of step.states) {
    const id = stateId(flow.flow, step.step, state.state);
    const assets = byState.get(id) ?? [];
    scenes.push({
      stateId: id, flow: flow.name, name: state.name, title: human(state.name),
      caption: assets.find((a) => a.caption)?.caption ?? human(state.name),
      captured: assets.length > 0,
      assets: assets.map((a) => ({ key: a.key, viewport: a.viewport ?? null, kind: a.kind, variant: a.variant ?? null, sha256: a.sha256 })),
    });
  }
  scenes.sort((a, b) => a.stateId.localeCompare(b.stateId));
  const json = { schema: 'agentsam.evidence.screenplay.v1', runId: manifest.runId, subject: manifest.subject, status: manifest.status, missing: manifest.missing, scenes };
  const lines = [`# ${manifest.subject}: screenplay`, '', `Run \`${manifest.runId}\` · status **${manifest.status}** · sealed ${manifest.sealedAt}`, ''];
  if (manifest.missing.length) lines.push(`Missing: ${manifest.missing.map((m) => `\`${m}\``).join(', ')}`, '');
  for (const scene of scenes) {
    lines.push(`## ${scene.stateId} · ${scene.title}`, '', scene.caption, '');
    if (!scene.captured) lines.push('_Not captured._', '');
    for (const asset of scene.assets) lines.push(`- ${asset.viewport ?? 'default'} · \`${asset.key}\` · ${asset.sha256.slice(0, 8)}`);
    if (scene.assets.length) lines.push('');
  }
  return { json, md: `${lines.join('\n')}\n` };
}
