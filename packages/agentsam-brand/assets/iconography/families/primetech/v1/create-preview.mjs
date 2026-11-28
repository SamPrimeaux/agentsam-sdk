import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('packages/agentsam-brand/dist/iconography/primetech/v1');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const icons = new Map(manifest.icons.map((icon) => [icon.id, icon]));
const colorways = manifest.metadata.colorways;
const shapes = manifest.metadata.shapes;
const width = 1800;
const headerHeight = 210;
const rowHeight = 164;
const height = headerHeight + colorways.length * rowHeight + 48;
const labelX = 54;
const columns = [470, 930, 1390];
const iconSize = 118;
const iconTopOffset = 22;
const bg = '#E9EDF3';
const card = '#FFFFFF';

const text = [];
text.push(`<rect width="${width}" height="${height}" fill="${bg}"/>`);
text.push(`<text x="54" y="62" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="700" fill="#182235">PRIMETECH / SHARED BRAND ICON FAMILIES</text>`);
text.push(`<text x="54" y="104" font-family="Arial,Helvetica,sans-serif" font-size="18" fill="#53647D">Verified five-facet P · 8 colorways · 3 independent shapes · transparent SVG/PNG base icons</text>`);
for (let c = 0; c < shapes.length; c += 1) {
  text.push(`<text x="${columns[c]}" y="174" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" fill="#26354A">${shapes[c].name.toUpperCase()} — ${c === 0 ? 'TRANSPARENT' : c === 1 ? 'FILLED BADGE' : 'APP TILE'}</text>`);
}
const checker = `<pattern id="checker" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#F4F6F9"/><rect width="10" height="10" fill="#C7CFD9"/><rect x="10" y="10" width="10" height="10" fill="#C7CFD9"/></pattern>`;
text.push(`<defs>${checker}</defs>`);
const composites = [];

for (let r = 0; r < colorways.length; r += 1) {
  const colorway = colorways[r];
  const y = headerHeight + r * rowHeight;
  text.push(`<rect x="20" y="${y}" width="1760" height="148" rx="16" fill="${card}"/>`);
  text.push(`<text x="${labelX}" y="${y + 62}" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="700" fill="#182235">${colorway.name}</text>`);
  text.push(`<text x="${labelX}" y="${y + 89}" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="#64748B">${colorway.id}</text>`);
  for (let c = 0; c < shapes.length; c += 1) {
    const shape = shapes[c];
    const id = `${colorway.id}-${shape.id}`;
    if (!icons.has(id)) throw new Error(`preview_icon_missing:${id}`);
    const file = path.join(root, 'exports', id, 'favicon', '256.png');
    const image = await sharp(file).resize(iconSize, iconSize, { fit: 'contain' }).png().toBuffer();
    const left = Math.round(columns[c] - iconSize / 2);
    const top = y + iconTopOffset;
    if (shape.id === 'bare-p') {
      const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><rect width="140" height="140" rx="8" fill="url(#checker)"/><defs>${checker}</defs></svg>`);
      composites.push({ input: tile, left: left - 11, top: top - 11 });
    }
    composites.push({ input: image, left, top });
  }
}
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${text.join('')}</svg>`);
const out = path.join('packages/agentsam-brand/dist/iconography/primetech-icon-family-preview.png');
await sharp(svg).composite(composites).png({ compressionLevel: 9 }).toFile(out);
console.log(JSON.stringify({ preview: out, width, height, icon_count: icons.size }, null, 2));
