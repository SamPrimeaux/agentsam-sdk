/**
 * Minimal perspective helpers. The vanishing point sits slightly above
 * center so the near field (bottom) reads as the surface the viewer is
 * traveling over, and the upper field stays mostly empty black.
 */
export interface Viewport {
  width: number;
  height: number;
  vpX: number;
  vpY: number;
}

export function makeViewport(width: number, height: number): Viewport {
  return { width, height, vpX: width * 0.5, vpY: height * 0.42 };
}

/** Point along a ray: t=0 at the vanishing point, t=1 beyond the viewport edge. */
export function alongRay(vp: Viewport, angle: number, t: number, out: { x: number; y: number }): void {
  // ease outward so geometry is dense near the horizon, sparse near the viewer
  const r = t * t * Math.max(vp.width, vp.height) * 0.75;
  out.x = vp.vpX + Math.cos(angle) * r;
  out.y = vp.vpY + Math.sin(angle) * r * 0.78; // slight vertical compression
}
