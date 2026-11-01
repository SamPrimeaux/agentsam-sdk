import React, { useId, useMemo } from 'react';
import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';
import { TemplateSchematic } from './TemplateSchematic';

/** Lightweight 2D floor-plan preview for gallery cards (reuses schematic SSOT). */
export function CadPreview2D({ project, className }: { project: ProjectState; className?: string }) {
  return <TemplateSchematic project={project} className={className || 'cad-preview-svg'} />;
}

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * Static isometric block preview — not a live engine.
 * Used when we only have a project name / revision label, or want a 3D-flavored card.
 */
export function CadPreview3DStatic({
  seed,
  label,
  walls = 8,
  rooms = 3,
}: {
  seed: string;
  label?: string;
  walls?: number;
  rooms?: number;
}) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const hue = hashHue(seed || 'cad');
  const wallCount = Math.max(4, Math.min(18, walls));
  const roomCount = Math.max(1, Math.min(8, rooms));
  const blocks = useMemo(() => {
    const out: Array<{ x: number; y: number; w: number; d: number; h: number }> = [];
    for (let i = 0; i < roomCount; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      out.push({
        x: -36 + col * 28 + (i % 2) * 4,
        y: -8 + row * 22,
        w: 22 + (i % 3) * 4,
        d: 16 + ((i + 1) % 2) * 6,
        h: 14 + (wallCount % 5) + (i % 3) * 3,
      });
    }
    return out;
  }, [roomCount, wallCount]);

  const iso = (x: number, y: number, z: number) => {
    const ix = (x - y) * 0.866;
    const iy = (x + y) * 0.5 - z;
    return { x: 80 + ix, y: 78 + iy };
  };

  return (
    <svg className="cad-preview-svg cad-preview-3d" viewBox="0 0 160 120" role="img" aria-label={label || '3D model preview'}>
      <defs>
        <linearGradient id={`cad3d_sky_${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue} 28% 16%)`} />
          <stop offset="100%" stopColor={`hsl(${(hue + 40) % 360} 22% 10%)`} />
        </linearGradient>
        <linearGradient id={`cad3d_face_${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue} 42% 58%)`} />
          <stop offset="100%" stopColor={`hsl(${hue} 36% 38%)`} />
        </linearGradient>
      </defs>
      <rect width="160" height="120" fill={`url(#cad3d_sky_${uid})`} />
      <ellipse cx="80" cy="96" rx="54" ry="10" fill="#00000055" />
      {blocks.map((b, index) => {
        const top = [
          iso(b.x, b.y, b.h),
          iso(b.x + b.w, b.y, b.h),
          iso(b.x + b.w, b.y + b.d, b.h),
          iso(b.x, b.y + b.d, b.h),
        ];
        const left = [
          iso(b.x, b.y + b.d, 0),
          iso(b.x, b.y + b.d, b.h),
          iso(b.x + b.w, b.y + b.d, b.h),
          iso(b.x + b.w, b.y + b.d, 0),
        ];
        const right = [
          iso(b.x + b.w, b.y, 0),
          iso(b.x + b.w, b.y, b.h),
          iso(b.x + b.w, b.y + b.d, b.h),
          iso(b.x + b.w, b.y + b.d, 0),
        ];
        const poly = (pts: Array<{ x: number; y: number }>) => pts.map((p) => `${p.x},${p.y}`).join(' ');
        return (
          <g key={index} opacity={0.92}>
            <polygon points={poly(left)} fill={`hsl(${hue} 30% 28%)`} stroke="#ffffff22" strokeWidth="0.6" />
            <polygon points={poly(right)} fill={`hsl(${hue} 34% 34%)`} stroke="#ffffff18" strokeWidth="0.6" />
            <polygon points={poly(top)} fill={`url(#cad3d_face_${uid})`} stroke="#ffffff33" strokeWidth="0.7" />
          </g>
        );
      })}
      <text x="10" y="16" fill="#c9d4e5" fontSize="8" fontFamily="ui-monospace, monospace">
        3D · lightweight
      </text>
    </svg>
  );
}

/** Image/thumbnail preview for BIM starters and registered scene stills. */
export function CadPreviewImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="cad-preview-image">
      <img src={src} alt={alt} loading="lazy" decoding="async" />
    </div>
  );
}
