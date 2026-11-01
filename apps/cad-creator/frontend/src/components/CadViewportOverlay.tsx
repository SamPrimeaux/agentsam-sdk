import React from 'react';
import { Box, Grid2X2, Layers3, Ruler } from 'lucide-react';

export interface CadViewportOverlayProps {
  mode: '2d' | '3d';
  projectName: string;
  walls: number;
  openings: number;
  rooms: number;
  fixtures: number;
  hint?: string;
  cameraLabel?: string;
  unit?: string;
}

/** Compact professional HUD for plan/model viewports (not a second toolbar). */
export function CadViewportOverlay({
  mode,
  projectName,
  walls,
  openings,
  rooms,
  fixtures,
  hint,
  cameraLabel,
  unit = 'in',
}: CadViewportOverlayProps) {
  return (
    <div className="cad-viewport-overlay" aria-label={`${mode === '2d' ? '2D' : '3D'} viewport status`}>
      <div className="cad-viewport-overlay__chip cad-viewport-overlay__identity">
        <Box size={12} aria-hidden="true" />
        <span>CAD Creator</span>
        <span className="cad-viewport-overlay__sep" aria-hidden="true">·</span>
        <strong title={projectName}>{projectName || 'Untitled'}</strong>
      </div>
      <div className="cad-viewport-overlay__chip" aria-label="Scene counts">
        <Layers3 size={12} aria-hidden="true" />
        <span>{walls} walls</span>
        <span className="cad-viewport-overlay__sep" aria-hidden="true">·</span>
        <span>{openings} openings</span>
        <span className="cad-viewport-overlay__sep" aria-hidden="true">·</span>
        <span>{rooms} spaces</span>
        <span className="cad-viewport-overlay__sep" aria-hidden="true">·</span>
        <span>{fixtures} fixtures</span>
      </div>
      <div className="cad-viewport-overlay__chip">
        {mode === '2d' ? <Grid2X2 size={12} aria-hidden="true" /> : <Ruler size={12} aria-hidden="true" />}
        <span>{mode === '2d' ? 'Plan' : cameraLabel || 'Model'}</span>
        <span className="cad-viewport-overlay__sep" aria-hidden="true">·</span>
        <span>{unit}</span>
      </div>
      {hint ? <div className="cad-viewport-overlay__hint">{hint}</div> : null}
    </div>
  );
}
