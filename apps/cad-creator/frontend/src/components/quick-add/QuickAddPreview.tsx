import React from 'react';
import { Box, LayoutTemplate, SlidersHorizontal, Trees } from 'lucide-react';
import type { QuickAddItem } from './types';

function ProjectPlanPreview({ item }: { item: QuickAddItem }) {
  const wallCount = Math.max(4, Math.min(12, Number(item.specs.wall_count) || 6));
  const lines = Array.from({ length: wallCount }, (_, index) => {
    const angle = (Math.PI * index) / wallCount;
    const cx = 80 + Math.cos(angle) * 34;
    const cy = 48 + Math.sin(angle) * 28;
    return <line key={index} x1="80" y1="48" x2={cx} y2={cy} />;
  });
  return (
    <svg className="qa-thumb-illustration" viewBox="0 0 160 96" aria-hidden="true">
      <rect x="22" y="10" width="116" height="76" rx="2" />
      <path d="M22 47H138M80 10V86M22 10L80 47L138 10M22 86L80 47L138 86" />
      <g className="qa-thumb-detail">{lines}</g>
      <rect x="66" y="38" width="28" height="20" rx="1" className="qa-thumb-accent" />
    </svg>
  );
}

function NaturePreview({ site }: { site: boolean }) {
  return (
    <svg className="qa-thumb-illustration qa-thumb-nature" viewBox="0 0 160 96" aria-hidden="true">
      {site && <path d="M10 76 Q42 62 70 75 T150 68 V96 H10Z" className="qa-thumb-ground" />}
      <g className="qa-thumb-tree">
        <path d="M38 76V55M34 76H42" />
        <path d="M38 18L20 56H56Z" />
      </g>
      <g className="qa-thumb-tree qa-thumb-tree-secondary">
        <path d="M82 82V62M78 82H86" />
        <path d="M82 32L64 65H100Z" />
      </g>
      <g className="qa-thumb-tree qa-thumb-tree-tertiary">
        <path d="M124 76V56M120 76H128" />
        <path d="M124 16L104 57H144Z" />
      </g>
      {site && <g className="qa-thumb-rocks"><circle cx="62" cy="78" r="3" /><circle cx="101" cy="82" r="2.5" /><circle cx="145" cy="80" r="2" /></g>}
    </svg>
  );
}

export function QuickAddPreview({ item }: { item: QuickAddItem }) {
  if (item.previewUrl) {
    return <img className="qa-thumb-img" src={item.previewUrl} alt="" loading="lazy" draggable={false} />;
  }

  if (item.kind === 'cad_terrain_preset') {
    return <NaturePreview site={item.specs.preview_kind === 'nature-site'} />;
  }

  if (item.tab === 'templates') return <ProjectPlanPreview item={item} />;

  if (item.kind === 'cad_parametric_template') {
    return <SlidersHorizontal size={32} strokeWidth={1.4} className="qa-thumb-icon" aria-hidden="true" />;
  }

  const w = Number(item.specs.w);
  const d = Number(item.specs.d);
  if (w > 0 && d > 0) {
    const scale = Math.min(66 / w, 36 / d);
    const rw = w * scale;
    const rd = d * scale;
    const color = typeof item.specs.color === 'string' ? item.specs.color : 'currentColor';
    return (
      <svg className="qa-thumb-footprint" viewBox="0 0 100 64" role="img" aria-label={`${w} by ${d} inch footprint`}>
        <rect x={50 - rw / 2} y={26 - rd / 2} width={rw} height={rd} rx="2"
          fill={color} fillOpacity="0.82" stroke="currentColor" strokeOpacity="0.45" />
        <text x="50" y="58" textAnchor="middle" fontSize="7" fill="currentColor" fillOpacity="0.72">{`${w} × ${d} in`}</text>
      </svg>
    );
  }

  if (item.kind === 'model_3d') return <Box size={32} strokeWidth={1.4} className="qa-thumb-icon" aria-hidden="true" />;
  if (item.category === 'nature') return <Trees size={32} strokeWidth={1.4} className="qa-thumb-icon" aria-hidden="true" />;
  return <LayoutTemplate size={30} strokeWidth={1.4} className="qa-thumb-icon" aria-hidden="true" />;
}
