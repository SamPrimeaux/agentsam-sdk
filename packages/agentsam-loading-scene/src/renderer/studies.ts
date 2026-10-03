import type { ScenePreset, SceneState, VisualIntent } from "../core/types.js";
import type { HyperspaceStudyId } from "./study-selection.js";

const TAU = Math.PI * 2;

export interface StudyRenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  seed: number;
  preset: ScenePreset;
  scene: SceneState;
  intent: VisualIntent;
  reducedMotion: boolean;
}

type DrawStudy = (input: StudyRenderContext) => void;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smoothLoop = (phase: number) => 0.5 - 0.5 * Math.cos(phase * TAU);

function accent(preset: ScenePreset, index: number): string {
  return preset.palette.accents[index % preset.palette.accents.length] ?? preset.palette.text;
}

function withAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void): void {
  const before = ctx.globalAlpha;
  ctx.globalAlpha = before * clamp(alpha, 0, 1);
  draw();
  ctx.globalAlpha = before;
}

function glowLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  alpha = 1,
  lineWidth = 1,
  blur = 8,
): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function vignette(ctx: CanvasRenderingContext2D, width: number, height: number, strength = 0.5): void {
  const gradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.47,
    Math.min(width, height) * 0.05,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.78,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.6, "rgba(0,0,0,0.04)");
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function drawHyperspaceBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  preset: ScenePreset,
  luminance = 0.5,
): void {
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#09111a");
  gradient.addColorStop(0.35, "#060b12");
  gradient.addColorStop(0.7, "#04070c");
  gradient.addColorStop(1, "#020407");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const bloom = ctx.createRadialGradient(
    width * 0.5,
    height * 0.44,
    0,
    width * 0.5,
    height * 0.48,
    Math.max(width, height) * 0.72,
  );
  bloom.addColorStop(0, `rgba(139,92,246,${0.06 + luminance * 0.09})`);
  bloom.addColorStop(0.25, `rgba(182,154,248,${0.04 + luminance * 0.06})`);
  bloom.addColorStop(0.55, "rgba(76,135,210,0.05)");
  bloom.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, width, height);

  const top = ctx.createLinearGradient(0, 0, width, 0);
  top.addColorStop(0, "rgba(0,0,0,0)");
  top.addColorStop(0.5, "rgba(139,92,246,0.025)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, Math.max(1, height * 0.22));

  void preset;
}

const drawRunway: DrawStudy = ({ ctx, width: w, height: h, time, seed, preset, intent, reducedMotion }) => {
  const vx = w * 0.5;
  const vy = h * 0.37;
  const horizon = vy + 16;
  const motion = reducedMotion ? 0.16 : 0.58 + intent.forwardMotion * 0.9;
  const t = time * motion;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.11)";
  ctx.lineWidth = 1;
  for (let i = -14; i <= 14; i++) {
    const x = w * 0.5 + i * w * 0.09;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(x, h * 1.08);
    ctx.stroke();
  }

  for (let j = 0; j < 17; j++) {
    let p = (j / 17 + (t * 0.00011) % 1) % 1;
    p *= p;
    const y = lerp(horizon, h * 1.02, p);
    const half = lerp(0, w * 0.62, p);
    ctx.globalAlpha = lerp(0.08, 0.28, p);
    ctx.beginPath();
    ctx.moveTo(vx - half, y);
    ctx.lineTo(vx + half, y);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < 5; i++) {
    const side = i - 2;
    const x = w * 0.5 + side * w * 0.095;
    const pulse = 0.55 + 0.45 * Math.sin(t * 0.0007 + i * 1.3 + seed);
    glowLine(ctx, vx, vy, x, h * 1.02, accent(preset, i), 0.34 + pulse * 0.18, 1.2, 10);
  }

  const radial = ctx.createRadialGradient(vx, vy, 0, vx, vy, Math.max(90, Math.min(w, h) * 0.12));
  radial.addColorStop(0, "rgba(245,247,255,0.56)");
  radial.addColorStop(0.12, "rgba(139,92,246,0.26)");
  radial.addColorStop(0.35, "rgba(112,136,255,0.10)");
  radial.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = radial;
  const rr = Math.max(110, Math.min(w, h) * 0.16);
  ctx.fillRect(vx - rr, vy - rr, rr * 2, rr * 2);

  vignette(ctx, w, h, 0.46);
};

const drawSignal: DrawStudy = ({ ctx, width: w, height: h, time, seed, preset, intent, reducedMotion }) => {
  const cx = w * 0.5;
  const cy = h * 0.48;
  const activity = reducedMotion ? 0.2 : 0.5 + intent.signalActivity * 0.9;
  const t = time * activity;

  ctx.save();
  for (let r = 26; r < Math.max(w, h) * 0.62; r += 24) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.strokeStyle = `rgba(165,182,230,${0.075 + 0.03 * Math.sin(r * 0.07 + t * 0.0005)})`;
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.085)";
  for (let i = -10; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + i * w * 0.065, h * 1.05);
    ctx.stroke();
  }
  for (let j = 0; j < 8; j++) {
    const p = j / 8;
    const y = cy + Math.pow(p, 1.8) * (h - cy);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  glowLine(ctx, cx, cy, cx, h * 0.98, accent(preset, 4), 0.34, 1.2, 12);

  const signalColors = [accent(preset, 4), accent(preset, 0), preset.palette.text];
  [0, 0.33, 0.66].forEach((offset, i) => {
    const phase = ((t * 0.00009) + offset + (seed % 1)) % 1;
    const p = smoothLoop(phase);
    const y = lerp(h * 0.95, cy, p);
    const color = signalColors[i]!;
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, y, 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  });

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(140, Math.min(w, h) * 0.18));
  glow.addColorStop(0, "rgba(150,160,255,0.26)");
  glow.addColorStop(0.3, "rgba(110,135,255,0.10)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  const r = Math.max(140, Math.min(w, h) * 0.18);
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  vignette(ctx, w, h, 0.48);
};

const drawLayers: DrawStudy = ({ ctx, width: w, height: h, time, seed, preset, intent, reducedMotion }) => {
  const cx = w * 0.5;
  const cy = h * 0.48;
  const motion = reducedMotion ? 0.18 : 0.45 + intent.layerLift * 0.65 + intent.generation * 0.2;
  const t = time * motion;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  for (let i = -10; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + i * w * 0.07, h);
    ctx.stroke();
  }

  const count = 6;
  for (let i = 0; i < count; i++) {
    const wobble = Math.sin(t * 0.00035 + i * 0.8 + seed) * Math.min(6, h * 0.008);
    const yy = cy + (i - (count - 1) / 2) * Math.min(34, h * 0.055) + wobble;
    const half = w * (0.29 - i * 0.018);
    const tilt = 5 * Math.sin(t * 0.00023 + i * 0.6 + seed);
    const color = accent(preset, i);

    ctx.fillStyle = "rgba(16,20,28,0.56)";
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.52;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx - half, yy);
    ctx.lineTo(cx, yy - 16 + tilt);
    ctx.lineTo(cx + half, yy);
    ctx.lineTo(cx, yy + 16 + tilt);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const pulse = ((t * 0.00011 + i / count) % 1);
    if (pulse < 0.28) {
      ctx.save();
      ctx.globalAlpha = (0.28 - pulse) * 2.2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([2, 5]);
  ctx.strokeStyle = "rgba(205,215,255,0.4)";
  ctx.beginPath();
  ctx.moveTo(cx, cy - Math.min(125, h * 0.25));
  ctx.lineTo(cx, h * 0.9);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  vignette(ctx, w, h, 0.48);
};

function bezier(
  ctx: CanvasRenderingContext2D,
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
  color: string,
  alpha = 1,
  lineWidth = 1,
): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.bezierCurveTo(b[0], b[1], c[0], c[1], d[0], d[1]);
  ctx.stroke();
  ctx.restore();
}

const drawQuantum: DrawStudy = ({ ctx, width: w, height: h, time, seed, preset, intent, reducedMotion }) => {
  const origin: [number, number] = [w * 0.5, h * 0.45];
  const activity = reducedMotion ? 0.16 : 0.5 + intent.signalActivity * 0.45 + intent.branching * 0.45;
  const t = time * activity;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  for (let i = -11; i <= 11; i++) {
    ctx.beginPath();
    ctx.moveTo(origin[0], origin[1]);
    ctx.lineTo(origin[0] + i * w * 0.07, h * 1.02);
    ctx.stroke();
  }
  for (let j = 0; j < 8; j++) {
    const p = Math.pow(j / 8, 1.7);
    const y = origin[1] + p * (h - origin[1]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? -1 : 1;
    const spread = (i + 1) * w * 0.085;
    const color = accent(preset, i);
    const sway = Math.sin(t * 0.0003 + i + seed) * w * 0.015;

    bezier(
      ctx,
      [origin[0], origin[1]],
      [origin[0] + side * spread * 0.3 + sway, origin[1] + h * 0.16],
      [origin[0] + side * spread * 0.9, h * 0.72],
      [origin[0] + side * spread * 1.6, h * 1.02],
      color,
      0.34 + i * 0.024,
      1.15,
    );

    [0, 0.38].forEach((offset, pulseIndex) => {
      const p = smoothLoop(((t * 0.00007 + i * 0.14 + offset) % 1));
      const py = lerp(origin[1], h * 0.99, p);
      const px = origin[0] + side * spread * 1.5 * Math.pow(p, 1.18) + sway * p;
      if (i < 4) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha *= 0.92;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(px, py, 1.7 - pulseIndex * 0.15, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    });
  }

  const glow = ctx.createRadialGradient(origin[0], origin[1], 0, origin[0], origin[1], Math.max(70, Math.min(w, h) * 0.12));
  glow.addColorStop(0, "rgba(235,240,255,0.34)");
  glow.addColorStop(0.3, "rgba(130,145,255,0.14)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  const rr = Math.max(70, Math.min(w, h) * 0.12);
  ctx.fillRect(origin[0] - rr, origin[1] - rr, rr * 2, rr * 2);

  vignette(ctx, w, h, 0.46);
};

const drawMerkle: DrawStudy = ({ ctx, width: w, height: h, time, preset, intent, reducedMotion }) => {
  const cx = w * 0.5;
  const cy = h * 0.49;
  const activity = reducedMotion ? 0.15 : 0.38 + intent.structure * 0.5 + intent.verification * 0.5;
  const t = time * activity;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.075)";
  for (let i = -12; i <= 12; i++) {
    const x = i * w * 0.055;
    ctx.beginPath();
    for (let j = 0; j <= 36; j++) {
      const y = (j / 36) * h;
      const pull = Math.exp(-Math.pow((y - cy) / (h * 0.22), 2));
      const xx = cx + x * (1 - 0.73 * pull);
      if (j) ctx.lineTo(xx, y);
      else ctx.moveTo(xx, y);
    }
    ctx.stroke();
  }

  for (let j = 0; j < 15; j++) {
    const base = (j / 14) * h;
    ctx.beginPath();
    for (let i = 0; i <= 42; i++) {
      const x = (i / 42) * w;
      const pull = Math.exp(-Math.pow((x - cx) / (w * 0.28), 2));
      const y = base + (cy - base) * 0.34 * pull;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  for (let k = 0; k < 5; k++) {
    const color = accent(preset, k);
    const rx = w * (0.18 + k * 0.055);
    const ry = h * (0.08 + k * 0.022);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha *= 0.28;
    ctx.lineWidth = 1.1;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, Math.sin(t * 0.00011 + k) * 0.03, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  const phase = (Math.sin(t * 0.0007) + 1) / 2;
  glowLine(ctx, cx, cy - h * 0.38, cx, cy + h * 0.42, accent(preset, 1), 0.24 + phase * 0.12, 1.15, 10);

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(135, Math.min(w, h) * 0.18));
  glow.addColorStop(0, "rgba(112,136,255,0.12)");
  glow.addColorStop(0.4, "rgba(144,112,230,0.08)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  const r = Math.max(135, Math.min(w, h) * 0.18);
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  vignette(ctx, w, h, 0.48);
};

const drawHorizon: DrawStudy = ({ ctx, width: w, height: h, time, preset, scene, intent, reducedMotion }) => {
  const cx = w * 0.5;
  const cy = h * 0.52;
  const r = Math.min(w, h) * 0.19;
  const activity = reducedMotion ? 0.15 : 0.36 + intent.convergence * 0.65 + intent.generation * 0.25;
  const t = time * activity;
  const error = scene.status === "error";
  const primary = error ? preset.palette.warning : accent(preset, 0);
  const warm = error ? preset.palette.warning : accent(preset, 3);

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.075)";
  for (let i = -13; i <= 13; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.22);
    ctx.lineTo(cx + i * w * 0.064, h * 1.04);
    ctx.stroke();
  }
  for (let j = 0; j < 8; j++) {
    const p = j / 8;
    const y = cy + r * 0.18 + Math.pow(p, 1.9) * (h - cy);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < 34; i++) {
    const angle = Math.PI + (i / 33) * Math.PI;
    const color = error ? preset.palette.warning : accent(preset, i);
    const len = 18 + 26 * (0.5 + 0.5 * Math.sin(i * 0.8 + t * 0.001));
    const x1 = cx + Math.cos(angle) * r;
    const y1 = cy + Math.sin(angle) * r;
    const x2 = cx + Math.cos(angle) * (r + len);
    const y2 = cy + Math.sin(angle) * (r + len);
    glowLine(ctx, x1, y1, x2, y2, color, 0.16 + (i % 5) * 0.016, 1, 6);
  }

  const arcGradient = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  arcGradient.addColorStop(0, primary);
  arcGradient.addColorStop(0.5, error ? preset.palette.warning : accent(preset, 1));
  arcGradient.addColorStop(1, warm);

  ctx.save();
  ctx.strokeStyle = arcGradient;
  ctx.lineWidth = 1.8;
  ctx.shadowColor = primary;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, TAU);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#04060a";
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, Math.PI, TAU);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx - r, cy);
  ctx.fill();

  glowLine(ctx, 0, cy, cx - r, cy, primary, 0.34, 1.15, 7);
  glowLine(ctx, cx + r, cy, w, cy, warm, 0.28, 1.15, 7);

  [0, 0.33, 0.66].forEach((offset, index) => {
    const pulse = smoothLoop((t * 0.00007 + offset) % 1);
    const py = lerp(h * 0.98, cy, pulse);
    glowLine(ctx, cx, cy, cx, h * 0.98, warm, 0.18, 1, 7);
    ctx.save();
    ctx.fillStyle = warm;
    ctx.globalAlpha *= 0.92;
    ctx.shadowColor = warm;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cx, py, 1.6 - index * 0.15, 0, TAU);
    ctx.fill();
    ctx.restore();
  });

  const halo = ctx.createRadialGradient(cx, cy - r * 0.05, 0, cx, cy, Math.max(150, Math.min(w, h) * 0.22));
  halo.addColorStop(0, error ? "rgba(242,139,130,0.10)" : "rgba(255,215,150,0.08)");
  halo.addColorStop(0.35, error ? "rgba(242,139,130,0.08)" : "rgba(145,112,235,0.10)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  const haloR = Math.max(150, Math.min(w, h) * 0.22);
  ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2);

  vignette(ctx, w, h, 0.5);
};

const STUDY_DRAWERS: Record<HyperspaceStudyId, DrawStudy> = {
  runway: drawRunway,
  signal: drawSignal,
  layers: drawLayers,
  quantum: drawQuantum,
  merkle: drawMerkle,
  horizon: drawHorizon,
};

export function drawHyperspaceStudy(id: HyperspaceStudyId, input: StudyRenderContext, alpha = 1): void {
  withAlpha(input.ctx, alpha, () => STUDY_DRAWERS[id](input));
}
