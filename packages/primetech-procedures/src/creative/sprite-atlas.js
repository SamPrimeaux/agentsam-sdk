import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ensureProjectDirectory, readProjectFile, sha256, writeJsonAtomic } from './paths.js';

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export async function buildSpriteAtlas({
  projectRoot,
  framePaths,
  outputDir = '.agentsam/primetech/companions/sprite-atlas',
  columns = null,
  cellWidth = null,
  cellHeight = null,
  padding = 0,
  fps = 12,
  loop = true,
  pivot = [0.5, 0.5],
} = {}) {
  if (!Array.isArray(framePaths) || framePaths.length < 2 || framePaths.length > 256) throw new Error('sprite_atlas_frame_count_invalid');
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('sprite_atlas_fps_invalid');
  if (!Number.isInteger(padding) || padding < 0 || padding > 64) throw new Error('sprite_atlas_padding_invalid');
  if (!Array.isArray(pivot) || pivot.length !== 2 || pivot.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('sprite_atlas_pivot_invalid');
  const sources = [];
  for (const framePath of framePaths) {
    const row = await readProjectFile(projectRoot, framePath, 32 * 1024 * 1024);
    const metadata = await sharp(row.bytes, { failOn: 'warning' }).metadata();
    if (!metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192) throw new Error(`sprite_frame_dimensions_invalid:${framePath}`);
    sources.push({ path: framePath, bytes: row.bytes, width: metadata.width, height: metadata.height, sha256: sha256(row.bytes) });
  }
  const maxWidth = Math.max(...sources.map(frame => frame.width));
  const maxHeight = Math.max(...sources.map(frame => frame.height));
  const cw = cellWidth ?? maxWidth;
  const ch = cellHeight ?? maxHeight;
  if (!Number.isInteger(cw) || !Number.isInteger(ch) || cw < 16 || ch < 16 || cw > 2048 || ch > 2048) throw new Error('sprite_atlas_cell_dimensions_invalid');
  const colCount = columns ?? Math.ceil(Math.sqrt(sources.length));
  if (!Number.isInteger(colCount) || colCount < 1 || colCount > sources.length) throw new Error('sprite_atlas_columns_invalid');
  const rowCount = Math.ceil(sources.length / colCount);
  const width = colCount * cw + (colCount + 1) * padding;
  const height = rowCount * ch + (rowCount + 1) * padding;
  if (width > 8192 || height > 8192 || width * height > 64_000_000) throw new Error('sprite_atlas_output_dimensions_exceeded');
  const composites = [];
  const frames = [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const x = padding + (index % colCount) * (cw + padding);
    const y = padding + Math.floor(index / colCount) * (ch + padding);
    const normalized = await sharp(source.bytes, { failOn: 'warning' })
      .rotate()
      .resize(cw, ch, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    composites.push({ input: normalized, left: x, top: y });
    frames.push({
      index,
      sourcePath: source.path,
      sourceSha256: source.sha256,
      x, y, width: cw, height: ch,
      durationMs: Math.round(1000 / fps),
      pivot: { x: pivot[0], y: pivot[1] },
    });
  }
  const root = await ensureProjectDirectory(projectRoot, outputDir);
  const atlasPath = path.join(root, 'atlas.png');
  const atlasBytes = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await fs.writeFile(atlasPath, atlasBytes, { mode: 0o600 });
  const manifest = {
    schema: 'agentsam.sprite-atlas.v1',
    frameCount: frames.length,
    fps,
    loop: Boolean(loop),
    atlas: { path: 'atlas.png', width, height, bytes: atlasBytes.length, sha256: sha256(atlasBytes) },
    cell: { width: cw, height: ch, padding },
    grid: { columns: colCount, rows: rowCount },
    frames,
    quality: { allFramesPlaced: frames.length === sources.length, frameOverflow: false, sourceFramesPreserved: true },
  };
  const manifestPath = path.join(root, 'atlas.json');
  await writeJsonAtomic(manifestPath, manifest);
  const preview = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sprite atlas preview</title><style>body{font:14px system-ui;background:#171a1d;color:#e9ecef;padding:24px}canvas{image-rendering:pixelated;max-width:min(80vw,640px);background:repeating-conic-gradient(#252a30 0 25%,#1e2328 0 50%) 50%/24px 24px;border:1px solid #50575f}button{padding:8px 12px;margin:8px 6px 8px 0}</style><h1>${htmlEscape(path.basename(root))}</h1><canvas id="view" width="${cw}" height="${ch}"></canvas><p><button id="play">Pause</button><button id="step">Next frame</button><span id="status"></span></p><script>const atlas=new Image();atlas.src='atlas.png';const data=${JSON.stringify({ frames, cw, ch, fps, loop, width, height })};const canvas=document.querySelector('#view'),ctx=canvas.getContext('2d');let index=0,playing=true,last=0;function draw(){const f=data.frames[index];ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(atlas,f.x,f.y,f.width,f.height,0,0,canvas.width,canvas.height);document.querySelector('#status').textContent='Frame '+(index+1)+' / '+data.frames.length;}function tick(t){if(playing&&t-last>=1000/data.fps){index++;if(index>=data.frames.length)index=data.loop?0:data.frames.length-1;last=t;draw();}requestAnimationFrame(tick);}atlas.onload=()=>{draw();requestAnimationFrame(tick);};document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'Pause':'Play';};document.querySelector('#step').onclick=()=>{index=(index+1)%data.frames.length;draw();};</script></html>`;
  const previewPath = path.join(root, 'preview.html');
  await fs.writeFile(previewPath, preview, { mode: 0o600 });
  return {
    ok: true,
    schema: manifest.schema,
    frameCount: frames.length,
    fps,
    atlasPath: path.relative(projectRoot, atlasPath),
    atlasSha256: sha256(atlasBytes),
    manifestPath: path.relative(projectRoot, manifestPath),
    previewPath: path.relative(projectRoot, previewPath),
    width, height,
    quality: manifest.quality,
  };
}
