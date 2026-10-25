import React, { useId } from 'react';
import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';

interface Props {
  project: ProjectState;
  className?: string;
}

/** Floor-plan preview drawn straight from a template's own rooms, walls and fixtures. */
export const TemplateSchematic: React.FC<Props> = ({ project, className = 'w-full h-full p-2' }) => {
  const gridId = `tpl_grid_${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  // Fit the view to what the template actually contains so every preview fills its frame.
  const xs: number[] = [], ys: number[] = [];
  project.walls.forEach(w => { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); });
  project.rooms.forEach(r => r.points.forEach(p => { xs.push(p[0]); ys.push(p[1]); }));
  project.furniture.forEach(f => { xs.push(f.x - f.w / 2, f.x + f.w / 2); ys.push(f.y - f.d / 2, f.y + f.d / 2); });
  const pad = 24;
  const minX = xs.length ? Math.min(...xs) - pad : -20, maxX = xs.length ? Math.max(...xs) + pad : 420;
  const minY = ys.length ? Math.min(...ys) - pad : -20, maxY = ys.length ? Math.max(...ys) + pad : 320;
  const box = { x: minX, y: minY, w: Math.max(40, maxX - minX), h: Math.max(40, maxY - minY) };
  return (
    <svg className={className} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${project.name} floor plan`}>
      <defs>
        <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#252525" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={`url(#${gridId})`} />

      {project.rooms.map((r, i) => {
        const pathD = r.points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ') + ' Z';
        return (
          <path
            key={i}
            d={pathD}
            fill={r.color || '#3b82f6'}
            fillOpacity="0.25"
            stroke="#3b82f6"
            strokeWidth="1"
            strokeDasharray="2,2"
          />
        );
      })}

      {project.walls.map((w, i) => (
        <line
          key={i}
          x1={w.x1}
          y1={w.y1}
          x2={w.x2}
          y2={w.y2}
          stroke={w.exterior ? '#ffffff' : '#94a3b8'}
          strokeWidth={w.thickness || 6}
          strokeLinecap="round"
        />
      ))}

      {project.furniture.map((f, i) => (
        <rect
          key={i}
          x={f.x - f.w / 2}
          y={f.y - f.d / 2}
          width={f.w}
          height={f.d}
          fill={f.color || '#475569'}
          stroke="#cbd5e1"
          strokeWidth="1"
          rx="2"
        />
      ))}
    </svg>
  );
};
