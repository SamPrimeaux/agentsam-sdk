import { evidenceError } from './contract.js';

const us = (ms) => Math.round(ms * 1000);

/**
 * `copro` is the copro-project module (injected, so the SDK needs no hard dependency). Clips reference
 * media by assetId only, never by URL or bucket, as the project contract requires. assets.json maps
 * each assetId to the file in the run so an editor can ingest the package.
 */
export function createCoproExporter({ copro, canvas = { width: 1920, height: 1080, frameRate: 30 }, stillSeconds = 3, viewport = 'desktop-1440x900' } = {}) {
  for (const name of ['createCoProProject', 'createTrack', 'createClip', 'serializeCoProProject']) {
    if (typeof copro?.[name] !== 'function') throw evidenceError('evidence_exporter_unavailable', 'copro');
  }
  return async ({ flowMap, assets, runId, beats = {} }) => {
    const flowAssets = assets.filter((a) => a.phase === '04-Build');
    const preferred = flowAssets.filter((a) => !a.viewport || a.viewport === viewport);
    const picks = (preferred.length > 0 ? preferred : flowAssets.filter((a) => a.viewport === flowAssets[0]?.viewport))
      .filter((a) => a.kind === 'still' || a.kind === 'clip')
      .sort((a, b) => a.stateId.localeCompare(b.stateId) || a.key.localeCompare(b.key));
    if (picks.length === 0) throw evidenceError('evidence_exporter_empty');

    const project = copro.createCoProProject({ id: `evidence:${runId}`, title: flowMap.subject, ...canvas });
    const track = copro.createTrack({ id: 'track:journey', kind: 'video', name: 'Journey' });
    const media = {};
    let cursorUs = 0;
    let clipCount = 0;
    for (const asset of picks) {
      const assetId = `ev-${asset.sha256.slice(0, 16)}`;
      const durationMs = asset.durationMs ?? asset.media?.durationMs ?? null;
      media[assetId] = {
        key: asset.key, name: asset.file, kind: asset.kind === 'clip' ? 'video' : 'image', contentType: asset.contentType,
        bytes: asset.bytes, sha256: asset.sha256, stateId: asset.stateId, viewport: asset.viewport ?? null, durationMs,
      };
      let segments;
      if (asset.kind === 'clip') {
        if (!durationMs) continue;
        const parts = asset.key.split('/');
        const beatsKey = `${parts.slice(0, asset.viewport ? 4 : 3).join('/')}/${parts[2]}.beats.json`;
        const timed = (beats[beatsKey] ?? []).filter((b) => Number.isFinite(b.atMs) && b.atMs < durationMs).sort((a, b) => a.atMs - b.atMs);
        segments = timed.length === 0 ? [{ startMs: 0, endMs: durationMs, label: null }]
          : timed.map((b, i) => ({ startMs: b.atMs, endMs: timed[i + 1]?.atMs ?? durationMs, label: b.label }));
      } else {
        segments = [{ startMs: 0, endMs: stillSeconds * 1000, label: null }];
      }
      for (const seg of segments) {
        const durationUs = us(seg.endMs - seg.startMs);
        if (durationUs <= 0) continue;
        clipCount += 1;
        track.clips.push(copro.createClip({
          id: `clip:${String(clipCount).padStart(3, '0')}`, assetId, startUs: cursorUs, durationUs, inUs: us(seg.startMs),
          metadata: { stateId: asset.stateId, ...(seg.label ? { label: seg.label } : {}) },
        }));
        cursorUs += durationUs;
      }
    }
    if (clipCount === 0) throw evidenceError('evidence_exporter_empty');
    project.tracks.push(track);
    project.metadata = { ...project.metadata, evidence: { schema: 'agentsam.evidence.v1', runId } };
    const check = copro.validateCoProProject?.(project);
    if (check && (check.ok === false || check.valid === false || (Array.isArray(check.errors) && check.errors.length > 0))) {
      throw evidenceError('evidence_exporter_invalid', check.errors ?? null);
    }
    return {
      files: [
        { name: 'project.copro.json', body: copro.serializeCoProProject(project) },
        { name: 'assets.json', body: `${JSON.stringify({ schema: 'agentsam.evidence.assets.v1', runId, assets: media }, null, 2)}\n` },
      ],
    };
  };
}
