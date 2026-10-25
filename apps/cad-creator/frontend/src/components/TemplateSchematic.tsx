import React, { useId } from 'react';
import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';

interface Props {
  project: ProjectState;
  className?: string;
}

/** Floor-plan preview drawn straight from a template's own rooms, walls and fixtures. */
export const TemplateSchematic: React.FC<Props> = ({ project, className = 'w-full h-full p-2' }) => {
  const gridId = `tpl_grid_${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  return (
    <svg className={className} viewBox="-20 -20 440 340" role="img" aria-label={`${project.name} floor plan`}>
      <defs>
        <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#252525" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="-20" y="-20" width="440" height="340" fill={`url(#${gridId})`} />

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
