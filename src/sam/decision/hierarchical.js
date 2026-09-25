/**
 * Hierarchical choose + beam retention for large taxonomies (skills, tools, errors).
 * When top options are close, keep multiple paths alive instead of greedy commit.
 */

/**
 * @param {Array<{ id: string, score: number, parent?: string|null }>} candidates
 * @param {object} [opts]
 * @param {number} [opts.beamWidth]
 * @param {number} [opts.closeMargin]  keep peers within this absolute score of the best
 */
export function beamRetain(candidates, opts = {}) {
  const beamWidth = opts.beamWidth ?? 3;
  const closeMargin = opts.closeMargin ?? 0.08;
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (!sorted.length) return [];
  const best = sorted[0].score;
  const close = sorted.filter((c) => best - c.score <= closeMargin);
  const beam = (close.length > 1 ? close : sorted).slice(0, beamWidth);
  return beam;
}

/**
 * Walk a taxonomy level-by-level with beam retention.
 * @param {object} opts
 * @param {Array<{ id: string, parent: string|null, score: number }>} opts.nodes
 * @param {number} [opts.beamWidth]
 * @param {number} [opts.closeMargin]
 */
export function hierarchicalChoose(opts = {}) {
  const nodes = Array.isArray(opts.nodes) ? opts.nodes : [];
  const roots = nodes.filter((n) => n.parent == null || n.parent === '');
  let beam = beamRetain(roots, opts);
  const path = [];
  while (beam.length) {
    // If multiple remain close, surface beam instead of committing.
    if (beam.length > 1) {
      return {
        ok: true,
        committed: false,
        beam: beam.map((b) => b.id),
        path: path.map((p) => p.id),
        reason: 'close_candidates_retained',
      };
    }
    const chosen = beam[0];
    path.push(chosen);
    const children = nodes.filter((n) => n.parent === chosen.id);
    if (!children.length) {
      return {
        ok: true,
        committed: true,
        value: chosen.id,
        path: path.map((p) => p.id),
        beam: [chosen.id],
      };
    }
    beam = beamRetain(children, opts);
  }
  return { ok: false, committed: false, beam: [], path: [], reason: 'empty_taxonomy' };
}
