import React from 'react';
import { Box, LayoutTemplate } from 'lucide-react';
import { CadPreview2D } from '../CadPreviewTreatments';
import { TEMPLATE_METADATA_LIST } from '../../lib/templates';
import type { QuickAddItem } from './types';

const HEX = /^#[0-9a-f]{6}$/i;

/** Lightweight previews only: an image, a 2D plan, or a scaled footprint. Never mounts a 3D engine. */
export function QuickAddPreview({ item }: { item: QuickAddItem }) {
  if (item.previewUrl) return <img className="qa-thumb-img" src={item.previewUrl} alt="" loading="lazy" draggable={false} />;
  if (item.tab === 'scenes') {
    const tpl = TEMPLATE_METADATA_LIST.find((t) => t.id === item.ref);
    return tpl ? <div className="qa-thumb-plan"><CadPreview2D project={tpl.project} /></div> : <LayoutTemplate size={26} className="qa-thumb-icon" />;
  }
  const w = Number(item.specs?.w);
  const d = Number(item.specs?.d);
  if (w > 0 && d > 0) {
    const scale = Math.min(66 / w, 36 / d);
    const rw = w * scale;
    const rd = d * scale;
    const color = typeof item.specs?.color === 'string' && HEX.test(item.specs.color) ? item.specs.color : 'currentColor';
    return (
      <svg className="qa-thumb-footprint" viewBox="0 0 100 64" role="img" aria-label={`${w} by ${d} inch footprint`}>
        <rect x={50 - rw / 2} y={26 - rd / 2} width={rw} height={rd} rx="2" fill={color} fillOpacity="0.9" stroke="currentColor" strokeOpacity="0.35" />
        <text x="50" y="58" textAnchor="middle" fontSize="7" fill="currentColor" fillOpacity="0.7">{`${w} × ${d} in`}</text>
      </svg>
    );
  }
  return <Box size={26} className="qa-thumb-icon" />;
}
