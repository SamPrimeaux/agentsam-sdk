const TILE = 16;
const THRESHOLD = 48;
const PAD = 24;
const MAX_REGIONS = 8;

async function decode(sharp, bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function diffTiles(a, b) {
  const { width, height } = a;
  const cols = Math.ceil(width / TILE);
  const rows = Math.ceil(height / TILE);
  const tiles = new Uint8Array(cols * rows);
  let changed = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d > THRESHOLD) { changed += 1; tiles[Math.floor(y / TILE) * cols + Math.floor(x / TILE)] = 1; }
    }
  }
  return { tiles, cols, rows, changed };
}

function regionsFrom({ tiles, cols, rows }, width, height) {
  const seen = new Uint8Array(tiles.length);
  const out = [];
  for (let start = 0; start < tiles.length; start += 1) {
    if (!tiles[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let minC = cols; let maxC = -1; let minR = rows; let maxR = -1; let count = 0;
    while (stack.length > 0) {
      const cur = stack.pop();
      const c = cur % cols;
      const r = Math.floor(cur / cols);
      count += 1;
      minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
        const nc = c + dc; const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const n = nr * cols + nc;
        if (tiles[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    out.push({ x: minC * TILE, y: minR * TILE, w: Math.min((maxC + 1) * TILE, width) - minC * TILE, h: Math.min((maxR + 1) * TILE, height) - minR * TILE, tiles: count });
  }
  return out.sort((a, b) => b.tiles - a.tiles).slice(0, MAX_REGIONS);
}

/**
 * Pair stills by phase, state, viewport and variant across two sealed runs of the same project, and
 * crop what changed side by side (then | now). Results are written under the newer run. Needs `sharp`.
 */
export async function compareRuns({ sharp, store, rootA, rootB, runA, manifestA, manifestB, now }) {
  const stills = (m) => m.assets.filter((a) => a.kind === 'still' && a.contentType === 'image/png');
  const keyOf = (a) => [a.phase, a.stateId ?? '', a.viewport ?? '', a.variant ?? ''].join('|');
  const unmatchedA = new Map(stills(manifestA).map((a) => [keyOf(a), a]));
  const base = `05-Review/compare/${runA}`;
  const pairs = [];
  const unmatchedB = [];
  for (const assetB of stills(manifestB)) {
    const assetA = unmatchedA.get(keyOf(assetB));
    if (!assetA) { unmatchedB.push(assetB.key); continue; }
    unmatchedA.delete(keyOf(assetB));
    const label = { stateId: assetB.stateId ?? null, viewport: assetB.viewport ?? null, variant: assetB.variant ?? null, a: assetA.key, b: assetB.key };
    const [bufA, bufB] = await Promise.all([store.get(`${rootA}/${assetA.key}`), store.get(`${rootB}/${assetB.key}`)]);
    if (!bufA || !bufB) { pairs.push({ ...label, status: 'unreadable', regions: [] }); continue; }
    if (assetA.sha256 === assetB.sha256) { pairs.push({ ...label, status: 'unchanged', changedRatio: 0, regions: [] }); continue; }
    const [da, db] = await Promise.all([decode(sharp, bufA), decode(sharp, bufB)]);
    if (da.width !== db.width || da.height !== db.height) {
      pairs.push({ ...label, status: 'dimension_changed', sizeA: [da.width, da.height], sizeB: [db.width, db.height], regions: [] });
      continue;
    }
    const diff = diffTiles(da, db);
    const regions = [];
    let n = 0;
    for (const r of regionsFrom(diff, da.width, da.height)) {
      const left = Math.max(0, r.x - PAD); const top = Math.max(0, r.y - PAD);
      const width = Math.min(da.width, r.x + r.w + PAD) - left; const height = Math.min(da.height, r.y + r.h + PAD) - top;
      const [cropA, cropB] = await Promise.all([
        sharp(bufA).extract({ left, top, width, height }).png().toBuffer(), sharp(bufB).extract({ left, top, width, height }).png().toBuffer(),
      ]);
      const sheet = await sharp({ create: { width: width * 2 + 8, height, channels: 4, background: { r: 24, g: 24, b: 24, alpha: 1 } } })
        .composite([{ input: cropA, left: 0, top: 0 }, { input: cropB, left: width + 8, top: 0 }]).png().toBuffer();
      n += 1;
      const name = `${assetB.stateId ?? 'brief'}${assetB.variant ?? ''}${assetB.viewport ? `-${assetB.viewport}` : ''}-r${n}.png`;
      await store.put(`${rootB}/${base}/${name}`, sheet);
      regions.push({ x: left, y: top, w: width, h: height, key: `${base}/${name}` });
    }
    pairs.push({ ...label, status: diff.changed === 0 ? 'unchanged' : 'changed', changedRatio: Number((diff.changed / (da.width * da.height)).toFixed(6)), regions });
  }
  const doc = { schema: 'agentsam.evidence.compare.v1', a: runA, b: manifestB.runId, createdAt: now().toISOString(), pairs, unmatchedA: [...unmatchedA.values()].map((a) => a.key), unmatchedB };
  await store.put(`${rootB}/${base}/compare.json`, `${JSON.stringify(doc, null, 2)}\n`);
  return { ...doc, key: `${base}/compare.json` };
}
